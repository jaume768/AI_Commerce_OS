#!/bin/bash
set -e

# Smoke test — verifies all services respond to health checks
# Usage: bash infra/scripts/smoke-test.sh

API_URL=${API_URL:-http://localhost:4000}
AGENT_URL=${AGENT_URL:-http://localhost:8000}
DASHBOARD_URL=${DASHBOARD_URL:-http://localhost:3000}

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass=0
fail=0

check() {
  local name=$1
  local url=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC} $name ($url)"
    pass=$((pass+1))
  else
    echo -e "${RED}FAIL${NC} $name ($url)"
    fail=$((fail+1))
  fi
}

echo "=== AI Commerce OS — Smoke Tests ==="
echo ""

check "API Node health"       "$API_URL/health"
check "API Node readiness"    "$API_URL/ready"
check "Agent Service health"  "$AGENT_URL/health"
check "Agent Service ready"   "$AGENT_URL/ready"
check "Dashboard health"      "$DASHBOARD_URL/api/health"

echo ""
echo "--- Auth Flow ---"

# Login and get token
LOGIN_RES=$(curl -sf -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}' 2>/dev/null || echo "")

if [ -n "$LOGIN_RES" ]; then
  TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
  STORE_ID=$(echo "$LOGIN_RES" | grep -o '"store_id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}PASS${NC} Login (got token)"
    pass=$((pass+1))
  else
    echo -e "${RED}FAIL${NC} Login (no token in response)"
    fail=$((fail+1))
  fi

  if [ -n "$TOKEN" ] && [ -n "$STORE_ID" ]; then
    # Test /auth/me
    ME_RES=$(curl -sf "$API_URL/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "")
    if [ -n "$ME_RES" ]; then
      echo -e "${GREEN}PASS${NC} GET /auth/me"
      pass=$((pass+1))
    else
      echo -e "${RED}FAIL${NC} GET /auth/me"
      fail=$((fail+1))
    fi

    # Test tasks list
    TASKS_RES=$(curl -sf "$API_URL/tasks?page=1&limit=10" \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-store-id: $STORE_ID" 2>/dev/null || echo "")
    if [ -n "$TASKS_RES" ]; then
      echo -e "${GREEN}PASS${NC} GET /tasks"
      pass=$((pass+1))
    else
      echo -e "${RED}FAIL${NC} GET /tasks"
      fail=$((fail+1))
    fi

    # Test create task (dummy)
    CREATE_RES=$(curl -sf -X POST "$API_URL/tasks" \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-store-id: $STORE_ID" \
      -H "Content-Type: application/json" \
      -d '{"title":"Smoke test task","task_type":"dummy","priority":1}' 2>/dev/null || echo "")
    if [ -n "$CREATE_RES" ]; then
      echo -e "${GREEN}PASS${NC} POST /tasks (create + enqueue)"
      pass=$((pass+1))
    else
      echo -e "${RED}FAIL${NC} POST /tasks"
      fail=$((fail+1))
    fi

    # Test approvals list
    APPROVALS_RES=$(curl -sf "$API_URL/approvals?page=1&limit=10" \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-store-id: $STORE_ID" 2>/dev/null || echo "")
    if [ -n "$APPROVALS_RES" ]; then
      echo -e "${GREEN}PASS${NC} GET /approvals"
      pass=$((pass+1))
    else
      echo -e "${RED}FAIL${NC} GET /approvals"
      fail=$((fail+1))
    fi
  fi
else
  echo -e "${RED}FAIL${NC} Login (could not reach API — is seed data loaded?)"
  fail=$((fail+1))
fi

echo ""
echo "=== Results: ${pass} passed, ${fail} failed ==="

if [ $fail -gt 0 ]; then
  exit 1
fi

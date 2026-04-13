#!/usr/bin/env bash
# =============================================================================
# test-whatsapp-flow.sh
#
# End-to-end test: simulates an inbound WhatsApp conversation that drives the
# "Support Welcome Flow" seeded by prisma/seed.ts.
#
# Prerequisites
#   1. API running:  cd apps/api && npm run start:dev
#   2. DB seeded:    cd apps/api && npx prisma db seed
#   3. .env has:     INBOUND_WEBHOOK_SECRET=<your-secret>
#
# Usage
#   chmod +x scripts/test-whatsapp-flow.sh
#   ./scripts/test-whatsapp-flow.sh [api_url] [webhook_secret] [phone_number]
#
# Defaults
#   api_url        = http://localhost:3001
#   webhook_secret = test-secret        (match INBOUND_WEBHOOK_SECRET in .env)
#   phone          = +27821234561       (Alice Johnson — seeded test contact)
# =============================================================================

set -euo pipefail

API="${1:-http://localhost:3001}"
SECRET="${2:-test-secret}"
PHONE="${3:-+27821234561}"

echo "============================================================"
echo " Appleberry WhatsApp Flow End-to-End Test"
echo "  API:    $API"
echo "  Phone:  $PHONE"
echo "============================================================"
echo ""

# ── Step 1: Login to get JWT ─────────────────────────────────────────────────
echo "[1/7] Authenticating as admin@appleberry.local ..."
LOGIN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@appleberry.local","password":"password123"}')

TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "ERROR: Login failed. Response:"
  echo "$LOGIN"
  exit 1
fi
echo "  -> Got access token"

# ── Step 2: Get WhatsApp account ID ──────────────────────────────────────────
echo ""
echo "[2/7] Fetching WhatsApp accounts ..."
ACCOUNTS=$(curl -s "$API/whatsapp/accounts" \
  -H "Authorization: Bearer $TOKEN")

# Pick the MOCK account (safe for testing — no real messages sent)
ACCOUNT_ID=$(echo "$ACCOUNTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$ACCOUNT_ID" ]; then
  echo "ERROR: No WhatsApp accounts found. Did you run 'npx prisma db seed'?"
  echo "Response: $ACCOUNTS"
  exit 1
fi
echo "  -> Using account: $ACCOUNT_ID"

# ── Helper: POST inbound message ─────────────────────────────────────────────
send_inbound() {
  local MSG="$1"
  local LABEL="$2"
  echo ""
  echo "  [INBOUND] $LABEL"
  echo "            From $PHONE: \"$MSG\""
  RESP=$(curl -s -X POST "$API/webhooks/whatsapp/inbound" \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: $SECRET" \
    -d "{
      \"whatsappAccountId\": \"$ACCOUNT_ID\",
      \"from\": \"$PHONE\",
      \"text\": \"$MSG\"
    }")
  echo "            Response: $RESP"
  # Small delay so the queue processor fires before the next message
  sleep 1
}

# ── Step 3: Trigger the flow with "hello" ────────────────────────────────────
echo ""
echo "[3/7] Sending 'hello' to trigger keyword -> START_FLOW ..."
send_inbound "hello" "Keyword trigger"

# ── Step 4: Provide name ─────────────────────────────────────────────────────
echo ""
echo "[4/7] Answering QUESTION: name ..."
send_inbound "Alice" "Answer: name = Alice"

# ── Step 5: Choose department ─────────────────────────────────────────────────
echo ""
echo "[5/7] Answering QUESTION: choice ..."
send_inbound "2" "Answer: choice = 2 (Support)"

# ── Step 6: Check message logs ───────────────────────────────────────────────
echo ""
echo "[6/7] Checking recent outbound message logs ..."
LOGS=$(curl -s "$API/messages?limit=10" \
  -H "Authorization: Bearer $TOKEN")
echo "  -> $LOGS"

# ── Step 7: Print chatbot run status ─────────────────────────────────────────
echo ""
echo "[7/7] Done. Check the API logs and DB for:"
echo "   - ChatbotRun status = COMPLETED"
echo "   - MessageLog entries with 'Support' response"
echo "   - InboxThread for $PHONE"
echo ""
echo "Useful DB queries (run in psql or Prisma Studio):"
cat <<'EOF'
  -- All runs for this workspace
  SELECT id, status, variables, "currentNodeId"
  FROM "ChatbotRun"
  ORDER BY "createdAt" DESC LIMIT 5;

  -- Recent outbound messages
  SELECT message, status, "createdAt"
  FROM "MessageLog"
  WHERE provider != 'mock' OR true
  ORDER BY "createdAt" DESC LIMIT 10;

  -- Inbox threads
  SELECT id, status, "updatedAt"
  FROM "InboxThread"
  ORDER BY "updatedAt" DESC LIMIT 5;
EOF
echo ""
echo "============================================================"
echo " Test complete! To run a REAL WhatsApp test:"
echo "  1. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in apps/api/.env"
echo "  2. In the DB, set the account providerType = 'CLOUD'"
echo "     (or use the 'WhatsApp Cloud (Real)' account created by seed)"
echo "  3. Re-run this script with the CLOUD account ID"
echo "     ./test-whatsapp-flow.sh http://localhost:3001 <secret> <real-phone>"
echo "============================================================"

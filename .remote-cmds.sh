echo "== format"; npm run format:check 2>&1 | tail -2
echo "== lint"; npm run lint 2>&1 | tail -6
echo "== typecheck"; npm run typecheck 2>&1 | grep -cE "error TS"
echo "== invite test"; cd apps/clinical && npx vitest run components/admin/invite-dialog.test.tsx components/auth/code-form.test.tsx 2>&1 | grep -E "FAIL|Test Files|Tests " ; cd ../..
echo "== nats clinical"; npm run test:nats -w @mhai/clinical 2>&1 | grep -E "FAIL|Test Files|Tests "
echo "== build"; npm run build 2>&1 | grep -E "error|Failed|Compiled" | head -10
echo "== checks"; npm run check:bundle 2>&1 | tail -1; npm run check:no-nats 2>&1 | tail -2; npm run check:platform-marker 2>&1 | tail -1
echo "== scripts"; node --test "scripts/**/*.test.mjs" 2>&1 | grep -E "^# (pass|fail)"

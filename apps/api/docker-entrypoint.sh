#!/bin/sh
set -e
echo "Running Prisma migrations..."
npx prisma migrate deploy
exec node dist/main.js

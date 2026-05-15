#!/bin/sh
set -e
echo "Running Prisma client generation..."
npx prisma generate
echo "Running Prisma migrations..."
npx prisma migrate deploy
exec node dist/main.js

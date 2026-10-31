#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg update
pkg install nodejs-lts -y
cd "$(dirname "$0")/.."
npm install
echo
echo "HUNT//ZONE installed. Run: npm run dev"

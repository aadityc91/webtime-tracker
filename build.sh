#!/bin/bash

# Create distribution directory
mkdir -p dist

# Clean previous builds
rm -rf dist/*

echo "📦 Building for Chrome..."
# Create temporary chrome dir
mkdir -p dist/chrome
# Copy all files
cp -r background content icons popup lib LICENSE README.md dist/chrome/
# Copy Chrome manifest
cp manifest-chrome.json dist/chrome/manifest.json
# Zip it
cd dist/chrome
zip -r ../chrome-extension.zip .
cd ../..
echo "✅ Chrome build ready: dist/chrome-extension.zip"

echo "📦 Building for Firefox..."
# Create temporary firefox dir
mkdir -p dist/firefox
# Copy all files
cp -r background content icons popup lib LICENSE README.md dist/firefox/
# Copy Firefox manifest
cp manifest-firefox.json dist/firefox/manifest.json
# Zip it
cd dist/firefox
zip -r ../firefox-extension.zip .
cd ../..
echo "✅ Firefox build ready: dist/firefox-extension.zip"

echo "🎉 Build complete!"

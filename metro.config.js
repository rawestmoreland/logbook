const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets us `require('@/assets/data/airports.db')` as a bundled asset for
// expo-sqlite (see src/lib/airports/index.native.ts).
config.resolver.assetExts.push('db');

module.exports = config;

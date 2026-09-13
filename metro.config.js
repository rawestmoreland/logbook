const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Lets us `require('@/assets/data/airports.db')` as a bundled asset for
// expo-sqlite (see src/lib/airports/index.ts).
config.resolver.assetExts.push('db');

// The Expo app lives at the repo root, so Metro's project root is the whole
// workspace — including apps/web and any nested node_modules npm could not
// hoist (a second copy of React, most likely). Metro never needs to resolve
// into the web app, so keep it out of the file map entirely.
//
// Anchored to this repo root so it cannot accidentally match a dependency
// whose own path happens to contain "apps". Expo seeds blockList as an array;
// append rather than replace so its defaults survive.
const ROOT = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...config.resolver.blockList,
  new RegExp(`^${ROOT}[\\\\/]apps[\\\\/].*$`),
];

module.exports = config;

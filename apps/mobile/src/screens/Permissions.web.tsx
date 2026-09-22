import React from 'react';

// The browser has no camera, location or health permissions to hand out in advance - it
// asks the moment a page uses them - so this screen does not exist on the web. It is a
// stub rather than a missing file because App.tsx imports it on every platform, and the
// native modules behind the real screen (media library, notifications) are not in the
// web bundle at all: importing them there leaves a blank page.

/** Nobody is walked through permissions in a browser. */
export const permissionsAsked = async () => true;

export default function PermissionsScreen() {
  return null;
}

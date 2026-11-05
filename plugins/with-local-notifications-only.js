const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * The expo-notifications versioned SDK plugin adds the `aps-environment` entitlement, which requires
 * the Push Notifications capability on the provisioning profile. This app only uses local
 * notifications, which need no such entitlement, so it is removed to keep the profile valid.
 *
 * expo-widgets adds the same entitlement unconditionally. Expo runs plugin mods in reverse list
 * order, so this plugin must stay FIRST in `app.json` `plugins`: that makes its mod run last.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};

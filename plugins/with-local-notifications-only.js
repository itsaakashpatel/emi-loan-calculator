const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * The expo-notifications versioned SDK plugin adds the `aps-environment` entitlement, which requires
 * the Push Notifications capability on the provisioning profile. This app only uses local
 * notifications, which need no such entitlement, so it is removed to keep the profile valid.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};

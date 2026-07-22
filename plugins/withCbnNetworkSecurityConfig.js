const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Brightcove's playback API (used by the CBN provider) sometimes redirects
// to a plain http:// CDN URL. Android release builds block cleartext (HTTP)
// traffic by default since API 28, which breaks video playback for that one
// domain even though our own requests always use https://. Rather than
// disabling the security policy app-wide (as android/app/src/debug/AndroidManifest.xml
// does for debug builds only), scope the exception to just this domain.
const NETWORK_SECURITY_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">brightcovecdn.com</domain>
    </domain-config>
</network-security-config>
`;

function withNetworkSecurityConfigFile(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG_XML,
        "utf-8"
      );
      return config;
    }
  ]);
}

function withNetworkSecurityConfigManifest(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml"
      );

      let manifest = fs.readFileSync(manifestPath, "utf-8");

      if (!manifest.includes("android:networkSecurityConfig")) {
        manifest = manifest.replace(
          "<application ",
          '<application android:networkSecurityConfig="@xml/network_security_config" '
        );
      }

      fs.writeFileSync(manifestPath, manifest, "utf-8");
      return config;
    }
  ]);
}

function withCbnNetworkSecurityConfig(config) {
  config = withNetworkSecurityConfigFile(config);
  config = withNetworkSecurityConfigManifest(config);
  return config;
}

module.exports = withCbnNetworkSecurityConfig;

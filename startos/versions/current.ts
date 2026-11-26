import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.18.4:0',
  releaseNotes: {
    en_US: `Requires StartOS 0.4.2 or later.

This security update fixes dashboard authentication, protects stored credentials when a connection address changes, and hardens first-run setup. When changing a node RPC URL, DDNS provider, or DDNS update URL, enter the matching credential again.`,
    es_ES: `Requiere StartOS 0.4.2 o posterior.

Esta actualización de seguridad corrige la autenticación del panel, protege las credenciales guardadas al cambiar una dirección y refuerza la configuración inicial. Si cambias la URL RPC del nodo, el proveedor de DDNS o la URL de actualización de DDNS, vuelve a introducir la credencial correspondiente.`,
    de_DE: `Erfordert StartOS 0.4.2 oder neuer.

Dieses Sicherheitsupdate korrigiert die Dashboard-Authentifizierung, schützt gespeicherte Zugangsdaten bei Adressänderungen und sichert die Ersteinrichtung ab. Gib bei einer Änderung der RPC-URL des Knotens, des DDNS-Anbieters oder der DDNS-Update-URL die zugehörigen Zugangsdaten erneut ein.`,
    pl_PL: `Wymaga StartOS 0.4.2 lub nowszego.

Aktualizacja zabezpieczeń naprawia uwierzytelnianie w panelu, chroni zapisane dane logowania przy zmianie adresu i poprawia bezpieczeństwo pierwszej konfiguracji. Po zmianie adresu URL RPC węzła, dostawcy DDNS lub adresu aktualizacji DDNS wpisz ponownie odpowiednie dane logowania.`,
    fr_FR: `Nécessite StartOS 0.4.2 ou une version ultérieure.

Cette mise à jour de sécurité corrige l’authentification du tableau de bord, protège les identifiants enregistrés lors d’un changement d’adresse et sécurise la configuration initiale. Si vous modifiez l’URL RPC du nœud, le fournisseur DDNS ou l’URL de mise à jour DDNS, saisissez à nouveau les identifiants correspondants.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})

import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.18.4:2',
  releaseNotes: {
    en_US: `Requires StartOS 0.4.2 or later.

Bitcoin Roots can now supply Bitcoin RPC alongside the existing choices of Bitcoin Core and Bitcoin Knots (pre-RDTS). Use one compatible node.

DATUM connection tests and background statistics now read the StartOS gateway status page when its JSON endpoint returns 404.

This security update fixes dashboard authentication, protects stored credentials when a connection address changes, and hardens first-run setup. When changing a node RPC URL, DDNS provider, or DDNS update URL, enter the matching credential again.`,
    es_ES: `Requiere StartOS 0.4.2 o posterior.

Ahora puedes elegir Bitcoin Roots como nodo RPC de Bitcoin, además de Bitcoin Core y Bitcoin Knots (pre-RDTS). Basta con un nodo compatible.

Las pruebas de conexión y las estadísticas periódicas de DATUM ahora leen la página de estado del nodo DATUM de StartOS cuando el endpoint JSON devuelve 404.

Esta actualización de seguridad corrige la autenticación del panel, protege las credenciales guardadas al cambiar una dirección y refuerza la configuración inicial. Si cambias la URL RPC del nodo, el proveedor de DDNS o la URL de actualización de DDNS, vuelve a introducir la credencial correspondiente.`,
    de_DE: `Erfordert StartOS 0.4.2 oder neuer.

Neben Bitcoin Core und Bitcoin Knots (pre-RDTS) kann jetzt auch Bitcoin Roots als Bitcoin-RPC-Knoten dienen. Ein kompatibler Knoten genügt.

DATUM-Verbindungstests und regelmäßige Statistikabfragen lesen jetzt die Statusseite des StartOS-Gateways, wenn der JSON-Endpunkt mit 404 antwortet.

Dieses Sicherheitsupdate korrigiert die Dashboard-Authentifizierung, schützt gespeicherte Zugangsdaten bei Adressänderungen und sichert die Ersteinrichtung ab. Gib bei einer Änderung der RPC-URL des Knotens, des DDNS-Anbieters oder der DDNS-Update-URL die zugehörigen Zugangsdaten erneut ein.`,
    pl_PL: `Wymaga StartOS 0.4.2 lub nowszego.

Oprócz Bitcoin Core i Bitcoin Knots (pre-RDTS) możesz teraz używać Bitcoin Roots jako węzła RPC Bitcoin. Wystarczy jeden zgodny węzeł.

Test połączenia DATUM i okresowe pobieranie statystyk odczytują teraz stronę stanu bramy StartOS, gdy punkt końcowy JSON zwraca błąd 404.

Aktualizacja zabezpieczeń naprawia uwierzytelnianie w panelu, chroni zapisane dane logowania przy zmianie adresu i poprawia bezpieczeństwo pierwszej konfiguracji. Po zmianie adresu URL RPC węzła, dostawcy DDNS lub adresu aktualizacji DDNS wpisz ponownie odpowiednie dane logowania.`,
    fr_FR: `Nécessite StartOS 0.4.2 ou une version ultérieure.

Bitcoin Roots peut désormais servir de nœud RPC Bitcoin, au même titre que Bitcoin Core et Bitcoin Knots (pre-RDTS). Un seul nœud compatible suffit.

Le test de connexion DATUM et le relevé périodique des statistiques lisent désormais la page d’état de la passerelle StartOS lorsque le point d’accès JSON renvoie une erreur 404.

Cette mise à jour de sécurité corrige l’authentification du tableau de bord, protège les identifiants enregistrés lors d’un changement d’adresse et sécurise la configuration initiale. Si vous modifiez l’URL RPC du nœud, le fournisseur DDNS ou l’URL de mise à jour DDNS, saisissez à nouveau les identifiants correspondants.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})

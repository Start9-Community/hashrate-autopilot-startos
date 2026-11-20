import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.18.2:4',
  releaseNotes: {
    en_US: `Requires StartOS 0.4.2 or later.

Hashrate Autopilot's access to Bitcoin's data is limited to its RPC credentials. Update Bitcoin when StartOS asks.`,
    es_ES: `Requiere StartOS 0.4.2 o posterior.

El acceso de Hashrate Autopilot a los datos de Bitcoin se limita a sus credenciales RPC. Actualiza Bitcoin cuando StartOS lo pida.`,
    de_DE: `Erfordert StartOS 0.4.2 oder neuer.

Der Zugriff von Hashrate Autopilot auf die Daten von Bitcoin ist auf dessen RPC-Zugangsdaten beschränkt. Aktualisiere Bitcoin, sobald StartOS dazu auffordert.`,
    pl_PL: `Wymaga StartOS 0.4.2 lub nowszego.

Dostęp Hashrate Autopilot do danych Bitcoina ogranicza się do jego danych uwierzytelniających RPC. Zaktualizuj Bitcoina, gdy StartOS o to poprosi.`,
    fr_FR: `Nécessite StartOS 0.4.2 ou une version ultérieure.

L’accès de Hashrate Autopilot aux données de Bitcoin se limite à ses identifiants RPC. Mettez Bitcoin à jour lorsque StartOS le demande.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})

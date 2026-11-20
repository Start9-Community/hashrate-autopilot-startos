import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.18.2:4',
  releaseNotes: {
    en_US: `Requires StartOS 0.4.2 or later.

Hashrate Autopilot's access to Bitcoin's data is limited to its RPC credentials. Update Bitcoin when StartOS asks. Until you do, Hashrate Autopilot waits and tells you to update Bitcoin instead of failing to start.`,
    es_ES: `Requiere StartOS 0.4.2 o posterior.

El acceso de Hashrate Autopilot a los datos de Bitcoin se limita a sus credenciales RPC. Actualiza Bitcoin cuando StartOS lo pida. Hasta entonces, Hashrate Autopilot espera y te indica que actualices Bitcoin en lugar de fallar al iniciarse.`,
    de_DE: `Erfordert StartOS 0.4.2 oder neuer.

Der Zugriff von Hashrate Autopilot auf die Daten von Bitcoin ist auf dessen RPC-Zugangsdaten beschränkt. Aktualisiere Bitcoin, sobald StartOS dazu auffordert. Bis dahin wartet Hashrate Autopilot und fordert dich auf, Bitcoin zu aktualisieren, statt fehlerhaft zu starten.`,
    pl_PL: `Wymaga StartOS 0.4.2 lub nowszego.

Dostęp Hashrate Autopilot do danych Bitcoina ogranicza się do jego danych uwierzytelniających RPC. Zaktualizuj Bitcoina, gdy StartOS o to poprosi. Do tego czasu Hashrate Autopilot czeka i prosi o aktualizację Bitcoina, zamiast kończyć uruchamianie błędem.`,
    fr_FR: `Nécessite StartOS 0.4.2 ou une version ultérieure.

L’accès de Hashrate Autopilot aux données de Bitcoin se limite à ses identifiants RPC. Mettez Bitcoin à jour lorsque StartOS le demande. D’ici là, Hashrate Autopilot attend et vous invite à mettre Bitcoin à jour au lieu d’échouer au démarrage.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})

import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk';

export const current = VersionInfo.of({
  version: '1.17.6:0',
  releaseNotes: {
    en_US:
      "Updates Hashrate Autopilot to upstream 1.17.6, with two fixes. Profit & Loss no longer invents a Lightning payout from a brief glitch in Ocean's reported balance — false entries are deleted on upgrade and cannot come back. And the dashboard API now answers browser requests only from the dashboard itself, closing a path where another site could act on your behalf using your saved login. How you reach the dashboard is unchanged, and scripts calling the API directly are unaffected.",
    es_ES:
      'Actualiza Hashrate Autopilot a la versión 1.17.6, con dos correcciones. Pérdidas y ganancias ya no inventa un pago Lightning a partir de un fallo momentáneo en el saldo que informa Ocean: las entradas falsas se eliminan al actualizar y no pueden volver. Además, la API del panel solo responde a peticiones del navegador procedentes del propio panel, cerrando una vía por la que otro sitio podía actuar en tu nombre usando tu sesión guardada. La forma de acceder al panel no cambia y los scripts que llaman directamente a la API no se ven afectados.',
    de_DE:
      'Aktualisiert Hashrate Autopilot auf Upstream 1.17.6, mit zwei Korrekturen. Gewinn und Verlust erfindet keine Lightning-Auszahlung mehr aus einem kurzen Fehler im von Ocean gemeldeten Guthaben – falsche Einträge werden beim Update gelöscht und können nicht zurückkehren. Außerdem beantwortet die Dashboard-API Browser-Anfragen nur noch vom Dashboard selbst und schließt damit einen Weg, auf dem eine andere Website mit deiner gespeicherten Anmeldung in deinem Namen handeln konnte. Der Zugang zum Dashboard bleibt unverändert, und Skripte, die die API direkt aufrufen, sind nicht betroffen.',
    pl_PL:
      'Aktualizuje Hashrate Autopilot do wersji 1.17.6, z dwiema poprawkami. Zyski i straty nie wymyślają już wypłaty Lightning na podstawie chwilowego błędu w saldzie raportowanym przez Ocean — fałszywe wpisy są usuwane przy aktualizacji i nie mogą wrócić. Ponadto API panelu odpowiada na żądania przeglądarki wyłącznie z samego panelu, zamykając drogę, którą inna witryna mogła działać w Twoim imieniu przy użyciu zapisanego logowania. Sposób dostępu do panelu się nie zmienia, a skrypty wywołujące API bezpośrednio nie są dotknięte.',
    fr_FR:
      "Met Hashrate Autopilot à jour vers la version 1.17.6, avec deux correctifs. Le suivi des profits et pertes n'invente plus de paiement Lightning à partir d'une anomalie passagère du solde rapporté par Ocean : les entrées erronées sont supprimées à la mise à jour et ne peuvent pas revenir. Par ailleurs, l'API du tableau de bord ne répond plus qu'aux requêtes de navigateur provenant du tableau de bord lui-même, fermant une voie par laquelle un autre site pouvait agir en votre nom avec votre session enregistrée. L'accès au tableau de bord est inchangé et les scripts appelant l'API directement ne sont pas concernés.",
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
});

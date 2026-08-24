import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.18.2:0',
  releaseNotes: {
    en_US:
      "First release. Hashrate Autopilot keeps a rented-hashrate bid alive on the Braiins Hashpower marketplace at a price ceiling you set, so purchased hashrate keeps landing at your own Datum-connected pool without manual babysitting. It starts in DRY-RUN and places no real bid until you switch it to LIVE — and switching back out of LIVE does not retract a bid already placed. Bitcoin, Electrs and Datum Gateway are required; Bitcoin's RPC credentials are supplied by StartOS from its cookie, so there is nothing to paste in.",
    es_ES:
      'Primera versión. Hashrate Autopilot mantiene viva una puja de hashrate alquilado en el mercado Braiins Hashpower con el techo de precio que tú fijes, de modo que el hashrate comprado siga llegando a tu propio pool conectado a Datum sin vigilancia manual. Arranca en modo DRY-RUN y no realiza ninguna puja real hasta que lo cambies a LIVE; salir de LIVE no retira una puja ya realizada. Bitcoin, Electrs y Datum Gateway son necesarios; StartOS suministra las credenciales RPC de Bitcoin desde su cookie, así que no hay nada que pegar.',
    de_DE:
      'Erste Veröffentlichung. Hashrate Autopilot hält ein Gebot für gemietete Hashrate auf dem Braiins-Hashpower-Marktplatz an einer von Ihnen gesetzten Preisobergrenze aufrecht, damit die gekaufte Hashrate weiterhin in Ihrem eigenen Datum-verbundenen Pool landet, ohne dass Sie es ständig überwachen müssen. Es startet im DRY-RUN-Modus und gibt kein echtes Gebot ab, bis Sie auf LIVE umschalten; das Verlassen von LIVE zieht ein bereits abgegebenes Gebot nicht zurück. Bitcoin, Electrs und Datum Gateway sind erforderlich; StartOS liefert die RPC-Zugangsdaten von Bitcoin aus dessen Cookie, es ist also nichts einzufügen.',
    pl_PL:
      'Pierwsze wydanie. Hashrate Autopilot utrzymuje ofertę na wynajętą moc obliczeniową na rynku Braiins Hashpower przy ustalonym przez Ciebie pułapie ceny, dzięki czemu kupiona moc nadal trafia do Twojego własnego poola połączonego z Datum, bez ciągłego nadzoru. Uruchamia się w trybie DRY-RUN i nie składa prawdziwej oferty, dopóki nie przełączysz go na LIVE; wyjście z trybu LIVE nie wycofuje już złożonej oferty. Bitcoin, Electrs i Datum Gateway są wymagane; StartOS dostarcza dane logowania RPC Bitcoina z jego pliku cookie, więc nie trzeba niczego wklejać.',
    fr_FR:
      "Première version. Hashrate Autopilot maintient une enchère de hashrate loué sur la place de marché Braiins Hashpower au plafond de prix que vous fixez, afin que le hashrate acheté continue d'arriver dans votre propre pool connecté à Datum sans surveillance manuelle. Il démarre en mode DRY-RUN et ne place aucune enchère réelle tant que vous ne passez pas en LIVE ; quitter LIVE ne retire pas une enchère déjà placée. Bitcoin, Electrs et Datum Gateway sont requis ; StartOS fournit les identifiants RPC de Bitcoin depuis son cookie, il n'y a donc rien à coller.",
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})

<script lang="ts">
  import {
    Calendar,
    Editor,
    CalendarPanel,
    ContextMenu,
    getMenuOptions,
    getEditorItems,
    getToolbarItems,
    type CalendarInstanceApi,
    type CalendarEvent,
  } from "@svar-ui/svelte-calendar";
  import { Locale } from "@svar-ui/svelte-core";
  import { fr } from "@svar-ui/calendar-locales";
  import { fr as frCore } from "@svar-ui/core-locales";
  import { expandRrule, migrateRecurrence } from "@/calendar/recurrence";
  import RecurrenceEditor from "@/components/calendar/RecurrenceEditor.svelte";
  import PersonCombo from "@/components/calendar/PersonCombo.svelte";
  import PriorityEditor from "@/components/calendar/PriorityEditor.svelte";
  import CalendarIdEditor from "@/components/calendar/CalendarIdEditor.svelte";
  import { getCalendarStore } from "@/stores/calendar-store.svelte";

  import { CALENDARS } from "@/lib/calendar-categories";
  import type { CalendarEventData } from "@/lib/calendar-types";
  import { notifications } from "@/stores/notifications.svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { exportCalendar, importCalendar } from "@/lib/calendar-persistence";
  import {
    CALENDRIER_COLLES,
    decouperIdColle,
    estIdColle,
    projeterColles,
    type SeanceSituee,
  } from "@/colles/projection";
  import { colleursDuColloscope, memeColleur } from "@/colles/colloscope";
  import {
    COLONNES_PAR_DEFAUT,
    changerEleves,
    deplacerSeance,
    ligneRattrapage,
    reperer,
    type CelluleAEcrire,
    type ColonnesColloscope,
  } from "@/colles/ecriture-colloscope";
  import { readColloscope } from "@/colles/import-colloscope";
  import { spreadsheetGet, spreadsheetSaveCells } from "@/spreadsheet/store";
  import type { ColloscopeEleve } from "@/colles/colloscope";
  import { userProfile } from "@/stores/user-profile.svelte";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { createOrigin, dataBus } from "@/lib/data/bus";
  import { overlays } from "@/stores/overlays.svelte";
  import { ofType } from "@/lib/data/events";

  const words = { ...fr, ...frCore };
  const store = getCalendarStore();
  const RFC_DAY_MAP = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  let api: CalendarInstanceApi | null = $state(null);

  // ── Colles projetées depuis le colloscope ────────────────
  // Le calendrier est une VUE du colloscope, au même titre que la grille l'est
  // d'un tableur : la donnée reste dans `spreadsheet_cells`, on ne la recopie
  // JAMAIS dans `calendar_events`. C'est ce qui rend le doublon impossible —
  // il n'y a rien à accumuler d'un import à l'autre.
  // Déclaré ICI, avant `editorItems`, qui consomme `nomsEleves`.
  let seancesColloscope = $state<SeanceSituee[]>([]);
  let elevesColloscope = $state<ColloscopeEleve[]>([]);

  /** « NOM Prénom » — la MÊME forme que celle produite par la projection,
   *  pour que la saisie et l'affichage se correspondent. */
  const nomsEleves = $derived(
    elevesColloscope.map((e) => `${e.nom} ${e.prenom}`.trim()).filter(Boolean),
  );

  // ── Read the currently-selected event's start date from the Calendar's
  //    internal reactive editorData. This is the source of truth — the
  //    select-event handler is unreliable for timing. ──
  let eventStartDate = $state<Date | null>(null);

  $effect(() => {
    if (!api) return;
    const { editorData } = api.getReactiveState();
    // editorData is an IPublicWritable (Svelte store) — subscribe manually
    const unsub = editorData.subscribe((ed: any) => {
      const d = ed?.start;
      eventStartDate = d instanceof Date ? d : d ? new Date(d) : null;
    });
    return unsub;
  });

  // ── Editor items: defaults + calendar + location + priority + recurrence + persons
  //    eventStartDate is passed through to RecurrenceEditor via {...editor} spread ──
  const editorItems = $derived([
    ...getEditorItems(),
    { comp: CalendarIdEditor as any, key: "calendarId", label: "Calendrier" },
    { comp: "text", key: "location", label: "Lieu" },
    { comp: PriorityEditor as any, key: "priority", label: "Priorité" },
    { comp: RecurrenceEditor as any, key: "rrule", label: "Récurrence", eventStartDate },
    // Les élèves du colloscope alimentent la complétion : c'est par ce champ
    // qu'on désigne les concernés d'un rattrapage, et donc sa classe.
    { comp: PersonCombo as any, key: "persons", label: "Assigné à", suggestions: nomsEleves },
  ]);

  async function chargerColloscope() {
    const data = await readColloscope();
    seancesColloscope = data?.seances ?? [];
    elevesColloscope = data?.eleves ?? [];
  }

  $effect(() => {
    // Dépendance explicite : un ré-import change les identifiants de tableaux.
    void collesSettings.current.colloscope;
    void chargerColloscope();
  });

  // Un colloscope importé mais AUCUNE colle affichée, faute de savoir qui est
  // l'utilisateur. C'est l'état où la fonction PARAÎT cassée : il doit se voir
  // et RESTER visible.
  //
  // Première version : un toast. Mauvais choix — un message fugace pour la
  // condition même qui fait croire à une panne, alors que l'utilisateur a
  // dit rater les signalements passagers. Bandeau persistant, donc, qui
  // disparaît de lui-même dès que la situation se résout.
  //
  // DEUX situations, pas une : le nom absent, et le nom qui ne correspond à
  // aucun colleur du colloscope (une faute de frappe, un homonyme écrit
  // autrement). La seconde est la plus traître — tout paraît réglé, et rien
  // ne s'affiche.
  const alerteColleur = $derived.by(() => {
    if (seancesColloscope.length === 0) return null;
    const nom = userProfile.current.colleurName.trim();
    if (!nom) return { genre: "absent" as const, colleurs: [] as string[] };
    if (seancesColloscope.some((s) => memeColleur(s.colleur, nom))) return null;
    return { genre: "inconnu" as const, colleurs: colleursDuColloscope(seancesColloscope) };
  });

  // Canal de fraîcheur, sens base → calendrier : une cellule modifiée dans un
  // tableau du colloscope (par le tableur, la grille, ou notre propre écriture
  // retour) fait recharger la projection. Une seule voie de rafraîchissement.
  $effect(() => {
    const ids = new Set(
      Object.values(collesSettings.current.colloscope?.colloscopeSpreadsheetIds ?? {}),
    );
    if (ids.size === 0) return;
    const sub = dataBus.subscribe(
      ofType("cells-changed"),
      (ev) => {
        if (ids.has(ev.spreadsheetId)) void chargerColloscope();
      },
      { skipOrigin: origineCalendrier },
    );
    return () => sub.unsubscribe();
  });

  function isoLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ── Écriture retour : calendrier → colloscope ────────────
  // Routage par PRÉFIXE d'identifiant. Un `colle:…` ne touche jamais
  // `store.events` : il part dans `spreadsheet_cells`, et revient par la
  // projection. Un seul chemin, donc jamais deux fois le même événement —
  // c'est l'ajout optimiste qui produisait les doublons d'autrefois.

  function seanceDeId(id: string): SeanceSituee | null {
    const adr = decouperIdColle(id);
    if (!adr) return null;
    return (
      seancesColloscope.find(
        (s) => s.spreadsheetId === adr.spreadsheetId && s.rowIndex === adr.rowIndex,
      ) ?? null
    );
  }

  /** Pousse les cellules et annonce le changement — c'est ce signal, et lui
   *  seul, qui fera réapparaître la séance à sa nouvelle place. */
  async function ecrireDansColloscope(spreadsheetId: string, cellules: CelluleAEcrire[]) {
    if (cellules.length === 0) return;
    await spreadsheetSaveCells(spreadsheetId, cellules);
    // Le tableur et la grille ouverts se rechargent ; nous, on se recharge à
    // la main puisqu'on ignore notre propre émission (skip self).
    dataBus.emit({ type: "cells-changed", spreadsheetId, origin: origineCalendrier });
    await chargerColloscope();
  }

  const origineCalendrier = createOrigin("calendrier-colles");

  async function deplacerColle(seance: SeanceSituee, debut: Date, fin: Date) {
    const colonnes = await colonnesDe(seance.spreadsheetId);
    const { cellules, genre } = deplacerSeance(seance, debut, fin, colonnes);
    if (genre === "aucun") return;
    try {
      await ecrireDansColloscope(seance.spreadsheetId, cellules);
      notifications.setInfo(genre === "ajournement" ? "Colle ajournée" : "Colle décalée");
    } catch (err) {
      notifications.showError(`Report impossible : ${String(err)}`);
      void chargerColloscope(); // la vue reprend l'état réel de la base
    }
  }

  /** Changement des concernés d'une colle. Un sous-ensemble d'un groupe
   *  s'écrit en codes élèves, l'ensemble complet redevient le libellé du
   *  groupe (règle miroir de la lecture). */
  async function changerElevesColle(seance: SeanceSituee, noms: unknown) {
    const choisis = elevesDepuisNoms(noms);
    if (choisis.length === 0) return; // vider la liste ne veut rien dire ici
    const colonnes = await colonnesDe(seance.spreadsheetId);
    const cellules = changerEleves(seance, choisis, elevesColloscope, colonnes);
    if (cellules.length === 0) return;
    try {
      await ecrireDansColloscope(seance.spreadsheetId, cellules);
      notifications.setInfo("Élèves de la colle mis à jour");
    } catch (err) {
      notifications.showError(`Modification impossible : ${String(err)}`);
      void chargerColloscope();
    }
  }

  /** Titres de colonnes du tableau, relus une fois puis mémorisés : écrire à
   *  la mauvaise position serait pire que de ne pas écrire. */
  const colonnesConnues = new Map<string, ColonnesColloscope>();
  async function colonnesDe(spreadsheetId: string): Promise<ColonnesColloscope> {
    const connu = colonnesConnues.get(spreadsheetId);
    if (connu) return connu;
    try {
      const tab = await spreadsheetGet(spreadsheetId);
      const c = reperer(tab.columns.map((col) => col.title ?? ""));
      colonnesConnues.set(spreadsheetId, c);
      return c;
    } catch {
      return COLONNES_PAR_DEFAUT;
    }
  }

  // ── Expand recurring events for the visible range ────────
  const expandedEvents = $derived.by<CalendarEvent[]>(() => {
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 6);
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 12);

    const result: CalendarEvent[] = [];

    // Les colles d'ABORD, et surtout : elles ne transitent jamais par
    // `store.events`, dont chaque affectation déclenche un replace-all de
    // `calendar_events`. La séparation est structurelle, pas une discipline.
    const { evenements, doublons } = projeterColles(
      seancesColloscope,
      elevesColloscope,
      {
        colleurName: userProfile.current.colleurName,
        debut: isoLocal(rangeStart),
        fin: isoLocal(rangeEnd),
      },
    );
    result.push(...(evenements as CalendarEvent[]));
    if (doublons > 0) {
      console.warn(`[colles] ${doublons} ligne(s) en double dans le colloscope, ignorée(s)`);
    }

    for (const ev of store.events) {
      // Guard: some events may arrive from SVAR before start/end are resolved
      if (!(ev.start instanceof Date) || !(ev.end instanceof Date)) continue;

      if (ev.rrule) {
        const occurrences = expandRrule(ev.rrule, ev.start, rangeStart, rangeEnd, ev.exdates);
        const duration = ev.end.getTime() - ev.start.getTime();
        for (let i = 0; i < occurrences.length; i++) {
          const d = occurrences[i];
          const end = new Date(d.getTime() + duration);
          result.push({
            ...ev,
            id: `${ev.id}__${d.getTime()}`,
            start: d,
            end,
          });
        }
      } else {
        result.push(ev);
      }
    }
    return result;
  });

  // ── Events ──────────────────────────────────────────────
  const events = $derived<CalendarEvent[]>(expandedEvents);

  // ── Toolbar items: default + import/export buttons ──────
  const toolbarItems = $derived([
    ...getToolbarItems(),
    { comp: "spacer" },
    {
      id: "export-cal",
      comp: "button",
      icon: "wxi-file-up",
      text: "Exporter",
      handler: () => exportCalendar(),
    },
    {
      id: "import-cal",
      comp: "button",
      icon: "wxi-file-down",
      text: "Importer",
      handler: () => importCalendar(),
    },
  ]);

  // ── Calendar groups for filtering (semantic categories) ──
  const calendars = $derived(CALENDARS.map((c) => ({
    id: c.id,
    label: c.label,
    css: c.css,
    active: c.active,
  })));

  // ── Context menu ──────────────────────────────────────────
  const menuOptions = [
    ...getMenuOptions(),
    { id: "delete-this", text: "Supprimer cette occurrence", icon: "wxi-delete" },
    { id: "delete-future", text: "Supprimer cette occurrence et les suivantes", icon: "wxi-delete" },
    { id: "delete-all", text: "Tout supprimer", icon: "wxi-delete" },
  ];

  /** Show/hide delete items based on whether the event is recurring. */
  function menuFilter(item: any, event: any): boolean {
    if (!event) return true;
    const isRecurring = !!event.rrule;
    if (item.id === "delete-event") return !isRecurring;
    if (item.id === "delete-this" || item.id === "delete-future" || item.id === "delete-all")
      return isRecurring;
    return true;
  }

  async function handleContextMenu({ action, context }: { action: any; context: any }) {
    if (!action || !context) return;
    const bid = baseId(String(context.id));

    // Suppression d'une colle : REFUSÉE (arbitrage 2026-08-23). Supprimer la
    // ligne décalerait les 447 suivantes et invaliderait toutes les identités
    // déjà projetées ; et une colle se retire du colloscope, pas de sa vue.
    if (estIdColle(bid)) {
      if (String(action.id).startsWith("delete")) {
        notifications.showError(
          "Une colle ne se supprime pas depuis le calendrier — retirez-la du colloscope.",
        );
      }
      return;
    }

    // Auto-convert: if the event is not in the store but is a colle event,
    // create a non-recurring copy in the store so the user can act on it.
    let existing = store.events.find((e) => e.id === bid);
    if (!existing && context.id?.startsWith("colle-") && context.start && bid === String(context.id)) {
      const newEvent: CalendarEventData = {
        id: bid,
        text: context.text || "",
        start: context.start instanceof Date ? context.start : new Date(context.start),
        end: context.end instanceof Date ? context.end : new Date(context.end),
        color: context.color,
        calendarId: context.calendarId || "devoirs",
        location: context.location,
      };
      store.events = [...store.events, newEvent];
      existing = store.events.find((e) => e.id === bid);
    }

    if (!existing) return;

    if (action.id === "delete-this") {
      // Add this occurrence's date to exdates
      const occDate = context.start instanceof Date ? context.start : new Date(context.start);
      const isoDay = occDate.toISOString().slice(0, 10);
      const exdates = [...(existing.exdates || []), isoDay];
      store.events = store.events.map((e) => (e.id === bid ? { ...e, exdates } : e));
      notifications.setInfo("Occurrence supprimée");
    } else if (action.id === "delete-future") {
      if (!await confirm("Supprimer cette occurrence et toutes les suivantes ?", { kind: "warning" })) return;
      // Set UNTIL on the rrule to the day before this occurrence
      const occDate = context.start instanceof Date ? context.start : new Date(context.start);
      const until = new Date(occDate);
      until.setDate(until.getDate() - 1);
      until.setHours(23, 59, 59);
      const untilStr = until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const newRrule = existing.rrule
        ? existing.rrule.replace(/;?UNTIL=[^;]*/, "") + `;UNTIL=${untilStr}`
        : null;
      if (newRrule) {
        store.events = store.events.map((e) =>
          e.id === bid ? { ...e, rrule: newRrule } : e,
        );
        notifications.setInfo("Occurrences futures supprimées");
      }
    } else if (action.id === "delete-all") {
      if (!await confirm("Supprimer complètement cet événement récurrent ?", { kind: "warning" })) return;
      store.events = store.events.filter((e) => e.id !== bid);
      notifications.setInfo("Événement supprimé");
    } else if (action.id === "delete-event") {
      // Non-recurring delete: SVAR's menuAction already called api.exec("delete-event")
      // which removes it from the Calendar UI. We just clean up the store.
      store.events = store.events.filter((e) => e.id !== bid);
    }
  }

  // ── Event handlers: update store on Calendar mutations ────

  /** Strip recurrence expansion suffix: "evt__1706123456789" → "evt", "evt__r3" → "evt", "evt" → "evt" */
  function baseId(id: string): string {
    return id.replace(/__\d+$/, "").replace(/__r\d+$/, "");
  }

  /** Élèves désignés par les noms saisis (« NOM Prénom », la forme que produit
   *  la projection). */
  function elevesDepuisNoms(noms: unknown): ColloscopeEleve[] {
    if (!Array.isArray(noms)) return [];
    const cle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const index = new Map(
      elevesColloscope.map((e) => [cle(`${e.nom} ${e.prenom}`), e]),
    );
    return noms
      .map((n) => index.get(cle(String(n))))
      .filter((e): e is ColloscopeEleve => e !== undefined);
  }

  /**
   * Création dans le calendrier « Colles » = un RATTRAPAGE, donc une ligne
   * ajoutée au colloscope de la classe. La classe se déduit des élèves
   * choisis : sans eux, on ne saurait pas dans quel tableau écrire — on
   * refuse plutôt que de deviner.
   */
  async function creerRattrapage(event: CalendarEvent) {
    const choisis = elevesDepuisNoms(event.persons);
    if (choisis.length === 0) {
      notifications.showError(
        "Un rattrapage a besoin d'élèves : renseignez-les dans « Assigné à ».",
      );
      return;
    }
    const classes = new Set(choisis.map((e) => e.classe));
    if (classes.size > 1) {
      notifications.showError("Un rattrapage ne peut concerner qu'une seule classe.");
      return;
    }
    const classe = [...classes][0];
    const spreadsheetId = collesSettings.current.colloscope?.colloscopeSpreadsheetIds?.[classe];
    if (!spreadsheetId) {
      notifications.showError(`Aucun colloscope importé pour la classe ${classe}.`);
      return;
    }
    try {
      const tab = await spreadsheetGet(spreadsheetId);
      const cellules = ligneRattrapage(
        {
          classe,
          debut: event.start as Date,
          fin: event.end as Date,
          matiere: String(event.text ?? "").trim(),
          colleur: userProfile.current.colleurName,
          salle: String(event.location ?? "").trim(),
          eleves: choisis,
        },
        // EN FIN de tableau : insérer au milieu décalerait les lignes
        // suivantes et invaliderait les identités déjà projetées.
        tab.data.length,
        elevesColloscope,
        await colonnesDe(spreadsheetId),
      );
      await ecrireDansColloscope(spreadsheetId, cellules);
      notifications.setInfo(`Rattrapage ajouté au colloscope ${classe}`);
    } catch (err) {
      notifications.showError(`Rattrapage impossible : ${String(err)}`);
    }
  }

  function onAddEvent({ event }: { event: CalendarEvent }) {
    if (!(event.start instanceof Date) || !(event.end instanceof Date)) return;

    // Le calendrier « Colles » n'accueille pas d'événements propres : ce qu'on
    // y crée devient une ligne du colloscope, et revient par la projection.
    // Aucun ajout local — c'est cet ajout optimiste qui produisait autrefois
    // le même événement en double.
    if (event.calendarId === CALENDRIER_COLLES) {
      void creerRattrapage(event);
      return;
    }
    const data: CalendarEventData = {
      id: String(event.id),
      text: event.text || "",
      start: event.start,
      end: event.end,
      color: event.color,
      calendarId: event.calendarId || "perso",
      persons: event.persons,
      rrule: event.rrule,
      allDay: event.allDay,
      location: event.location,
      priority: event.priority,
    };
    store.events = [...store.events, data];
  }

  function onUpdateEvent({ id, event }: { id: string; event: CalendarEvent }) {
    const bid = baseId(id);

    // Une colle n'est pas un événement du calendrier : elle vit dans le
    // colloscope. On la réécrit là-bas, et elle nous revient par la projection.
    if (estIdColle(bid)) {
      const seance = seanceDeId(bid);
      if (!seance) return;
      if (event.start instanceof Date && event.end instanceof Date) {
        void deplacerColle(seance, event.start, event.end);
      }
      if ("persons" in event) void changerElevesColle(seance, event.persons);
      return;
    }

    const existing = store.events.find((e) => e.id === bid);
    if (!existing) return;

    const data: CalendarEventData = { ...existing };

    // ── The Calendar emits two kinds of updates:
    //   1. Drag — sends ONLY { start, end }, no metadata fields
    //   2. Editor — sends ALL fields (start, end, text, rrule, …)
    //
    //   Problem: when the user toggles recurrence ON in the Editor,
    //   the Calendar internally adjusts `start` to the next BYDAY
    //   occurrence BEFORE emitting the update.  We expand rrules
    //   externally, so we must preserve the original start in that case.
    //
    //   But when the user simply changes the date-time pickers,
    //   we MUST accept the new start/end. ──
    const hasMetadata =
      "text" in event || "rrule" in event || "location" in event ||
      "priority" in event || "persons" in event || "calendarId" in event;

    const rruleChanged = "rrule" in event && event.rrule !== existing.rrule;
    const startChanged = event.start instanceof Date && existing.start instanceof Date
      && event.start.getTime() !== existing.start.getTime();

    if (!hasMetadata) {
      // ── Drag: accept new start/end ──
      data.start = event.start;
      data.end = event.end;

      // If the event has a WEEKLY rrule, update BYDAY to match the new day
      if (data.rrule && event.start instanceof Date && data.rrule.includes("FREQ=WEEKLY")) {
        const newDay = RFC_DAY_MAP[event.start.getDay()];
        if (newDay) {
          data.rrule = data.rrule.replace(/BYDAY=[A-Z,]+/, `BYDAY=${newDay}`);
        }
      }
    } else if (rruleChanged && startChanged) {
      // ── Recurring toggle: Calendar shifted start as side effect → preserve original ──
      // (data.start already = existing.start from the spread above)
    } else {
      // ── Editor change (date picker, text, etc.): accept new start/end ──
      if (startChanged) {
        data.start = event.start;
        data.end = event.end;

        // Sync BYDAY with new day for WEEKLY rrules (same as drag)
        if (data.rrule && event.start instanceof Date && data.rrule.includes("FREQ=WEEKLY")) {
          const newDay = RFC_DAY_MAP[event.start.getDay()];
          if (newDay) {
            data.rrule = data.rrule.replace(/BYDAY=[A-Z,]+/, `BYDAY=${newDay}`);
          }
        }
      }
    }

    // Forward metadata fields
    if ("text" in event && event.text !== undefined) data.text = event.text as string;
    if ("color" in event && event.color !== undefined) data.color = event.color as string;
    if ("calendarId" in event && event.calendarId !== undefined) {
      data.calendarId = event.calendarId;
    }
    if ("location" in event && event.location !== undefined) {
      data.location = event.location;
    }
    if ("priority" in event && event.priority !== undefined) {
      data.priority = event.priority;
    }
    if ("persons" in event && event.persons !== undefined) {
      data.persons = event.persons;
    }
    if ("rrule" in event && event.rrule !== undefined) {
      data.rrule = event.rrule;
    }
    if ("allDay" in event && event.allDay !== undefined) {
      data.allDay = event.allDay;
    }

    store.events = store.events.map((e) => (e.id === bid ? data : e));

    // ── When we preserved original start/end above, the Calendar's internal
    //    event still has the shifted start.  Reset it so the visual display
    //    matches our store. ──
    if (rruleChanged && startChanged && api) {
      api.exec("update-event", { id: bid, event: { start: existing.start, end: existing.end } } as any);
    }
  }

  function onDeleteEvent({ id }: { id: string }) {
    const bid = baseId(id);
    store.events = store.events.filter((e) => e.id !== bid);
  }

  function onSelectEvent(_args: { event: CalendarEvent | null }) {
    // Start date is now read reactively from api.getReactiveState().editorData
    // via the $effect above — no need to handle it here.
  }

  function init(a: CalendarInstanceApi) {
    api = a;
    a.on("add-event", onAddEvent as any);
    a.on("update-event", onUpdateEvent as any);
    a.on("delete-event", onDeleteEvent as any);
    a.on("select-event", onSelectEvent as any);
  }

  // ── Public API for external importers (e.g. ColloscopePanel) ──
  export function importEvents(newEvents: CalendarEventData[]) {
    const existingIds = new Set(store.events.map((e) => e.id));
    const toAdd = newEvents.filter((e) => !existingIds.has(e.id)).map(migrateRecurrence);
    if (toAdd.length === 0) return 0;
    store.events = [...store.events, ...toAdd];
    return toAdd.length;
  }

  // ── CSS classes for calendar colour + priority/location on event rectangles ──
  const calendarClassMap = Object.fromEntries(CALENDARS.map((c) => [c.id, c.css]));

  function eventCss(ctx: any): string {
    const parts: string[] = [];
    const ev = ctx?.event ?? ctx?.data;
    if (!ev) return "";

    // Calendar colour class (e.g. "cal-cours", "cal-td", etc.)
    const calId = ev.calendarId;
    if (calId && calendarClassMap[calId]) {
      parts.push(calendarClassMap[calId]);
    }

    const prio = ev.priority;
    if (prio === "high") parts.push("ev-priority-high");
    else if (prio === "low") parts.push("ev-priority-low");

    const loc = ev.location;
    if (loc) parts.push("ev-has-location");

    return parts.join(" ");
  }
</script>

<div class="svar-calendar-panel">
    {#if alerteColleur}
      <!-- Persistant, pas fugace : c'est l'explication d'un calendrier qui
           semble vide alors qu'un colloscope est chargé. -->
      <div class="cal-invite" role="status">
        <i class="wxi-info" aria-hidden="true"></i>
        <span>
          {#if alerteColleur.genre === "absent"}
            Un colloscope est chargé, mais vos colles ne peuvent pas être
            reconnues : renseignez votre <strong>nom de colleur</strong> dans
            Réglages › Profil.
          {:else}
            Aucune colle au nom de
            <strong>{userProfile.current.colleurName}</strong> dans le
            colloscope. Les colleurs qui y figurent :
            <em>{alerteColleur.colleurs.join(", ")}</em>.
          {/if}
        </span>
        <!-- La section est passée par intention ; `openSettings` l'ignore
             aujourd'hui (elle ouvre l'overlay sans naviguer) — d'où le
             libellé, qui ne promet pas d'atterrir sur le profil. -->
        <button type="button" onclick={() => overlays.openSettings("profile")}>
          Ouvrir les réglages
        </button>
      </div>
    {/if}
    <Locale {words}>
      <ContextMenu {api} options={menuOptions} filter={menuFilter} onclick={handleContextMenu}>
          <Calendar
            {events}
            toolbar={{ items: toolbarItems }}
            view="week"
          views={[
            {
              id: "day",
              sections: { timeGrid: { yScale: { startHour: 8, endHour: 22 } } },
            },
            {
              id: "week",
              sections: { timeGrid: { yScale: { startHour: 8, endHour: 22 } } },
            },
            "month",
          ]}
          {init}
          {eventCss}
          cellCss={(ctx) => {
            if (ctx.date) {
              const d = ctx.date.getDay();
              if (d === 0 || d === 6) return "wx-weekend";
            }
            return "";
          }}
        >
          <CalendarPanel {calendars} accessor="calendarId" />
        </Calendar>
        {#if api}
          <Editor {api} items={editorItems} />
        {/if}
      </ContextMenu>
    </Locale>
</div>

<style>
  .svar-calendar-panel {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Bandeau d'invite : discret mais PERSISTANT — il explique un calendrier
     qui paraît vide, il ne doit pas s'effacer tout seul. Couleurs aux tokens. */
  .cal-invite {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    font-family: var(--font-ui);
    font-size: 12.5px;
    color: var(--fg);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .cal-invite i {
    flex: none;
    font-size: 14px;
    color: var(--accent);
  }
  .cal-invite span {
    flex: 1;
    min-width: 0;
  }
  .cal-invite button {
    flex: none;
    padding: 4px 10px;
    font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
  }
  .cal-invite button:hover {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  /* ── Prevent selection bleeding during drag ──────────── */
  .svar-calendar-panel :global(::selection) {
    background: transparent;
  }

  .svar-calendar-panel :global(.wx-box-event),
  .svar-calendar-panel :global(.wx-bar-event) {
    user-select: none;
    -webkit-user-select: none;
  }

  /* Hide drag stub when not actively dragging */
  .svar-calendar-panel :global(.wx-drag-stub:not([style*="display: block"])) {
    display: none !important;
  }

  /* ── Navigation toolbar ──────────────────────────────── */
  .svar-calendar-panel :global(.wx-navigation) {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    font-family: var(--font-ui, system-ui);
    gap: 8px;
  }

  .svar-calendar-panel :global(.wx-navigation button),
  .svar-calendar-panel :global(.wx-navigation .wx-button) {
    background: var(--surface);
    color: var(--fg-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .svar-calendar-panel :global(.wx-navigation button:hover),
  .svar-calendar-panel :global(.wx-navigation .wx-button:hover) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
    color: var(--fg);
  }

  .svar-calendar-panel :global(.wx-navigation .wx-button-active),
  .svar-calendar-panel :global(.wx-navigation button.wx-button-active) {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  /* ── Title text ──────────────────────────────────────── */
  .svar-calendar-panel :global(.wx-navigation .wx-nav-title) {
    font-size: 15px;
    font-weight: 600;
    color: var(--fg);
    font-family: var(--font-ui, system-ui);
  }

  /* ── Time grid cells ─────────────────────────────────── */
  .svar-calendar-panel :global(.wx-grid-cell) {
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-grid-line) {
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-now-line) {
    background: var(--accent);
  }

  .svar-calendar-panel :global(.wx-now-dot) {
    background: var(--accent);
  }

  /* ── Time scale labels ───────────────────────────────── */
  .svar-calendar-panel :global(.wx-y-scale .wx-y-label) {
    color: var(--fg-muted);
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
  }

  /* ── Box events (month view) ─────────────────────────── */
  .svar-calendar-panel :global(.wx-box-event) {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    line-height: 1.3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--fg) 10%, transparent);
  }

  .svar-calendar-panel :global(.wx-box-event:hover) {
    opacity: 0.85;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--fg) 15%, transparent);
  }

  /* ── Bar events (week/day all-day bar) ───────────────── */
  .svar-calendar-panel :global(.wx-bar-event) {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
  }

  /* ── Month grid ──────────────────────────────────────── */
  .svar-calendar-panel :global(.wx-month-grid) {
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-month-label) {
    color: var(--fg-muted);
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 0;
    background: var(--surface);
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-month-day) {
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-today .wx-month-day-label) {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Editor sidebar ──────────────────────────────────── */
  .svar-calendar-panel :global(.wx-editor) {
    background: var(--surface);
    border-left: 1px solid var(--border);
    padding: 12px;
    font-family: var(--font-ui, system-ui);
    overflow-y: auto;
  }

  .svar-calendar-panel :global(.wx-editor label) {
    color: var(--fg-muted);
    font-size: 12px;
    margin-bottom: 4px;
  }

  .svar-calendar-panel :global(.wx-editor input),
  .svar-calendar-panel :global(.wx-editor textarea) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
  }

  .svar-calendar-panel :global(.wx-editor input:focus),
  .svar-calendar-panel :global(.wx-editor textarea:focus) {
    border-color: var(--accent);
    outline: none;
  }

  .svar-calendar-panel :global(.wx-editor .wx-button) {
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .svar-calendar-panel :global(.wx-editor .wx-button:hover) {
    opacity: 0.85;
  }

  /* ── Context menu ────────────────────────────────────── */
  .svar-calendar-panel :global(.wx-context-menu) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--fg) 15%, transparent);
    padding: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .svar-calendar-panel :global(.wx-context-menu-item) {
    color: var(--fg);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .svar-calendar-panel :global(.wx-context-menu-item:hover) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
  }

  /* ── CalendarPanel (sidebar groups) ──────────────────── */
  .svar-calendar-panel :global(.wx-calendar-panel) {
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 12px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .svar-calendar-panel :global(.wx-calendar-name) {
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg);
    font-size: 12px;
  }

  /* ── Calendar category colors (theme-adaptive via --syntax-***) ── */
  .svar-calendar-panel :global(.cal-cours.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-keyword) 20%, var(--surface));
    color: var(--syntax-keyword);
  }

  .svar-calendar-panel :global(.cal-cours.wx-calendar-name:hover) {
    background: color-mix(in srgb, var(--syntax-keyword) 30%, var(--surface));
  }

  .svar-calendar-panel :global(.cal-td.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-number) 20%, var(--surface));
    color: var(--syntax-number);
  }

  .svar-calendar-panel :global(.cal-td.wx-calendar-name:hover) {
    background: color-mix(in srgb, var(--syntax-number) 30%, var(--surface));
  }

  .svar-calendar-panel :global(.cal-devoirs.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-string) 20%, var(--surface));
    color: var(--syntax-string);
  }

  .svar-calendar-panel :global(.cal-devoirs.wx-calendar-name:hover) {
    background: color-mix(in srgb, var(--syntax-string) 30%, var(--surface));
  }

  .svar-calendar-panel :global(.cal-perso.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-constant) 20%, var(--surface));
    color: var(--syntax-constant);
  }

  .svar-calendar-panel :global(.cal-perso.wx-calendar-name:hover) {
    background: color-mix(in srgb, var(--syntax-constant) 30%, var(--surface));
  }

  /* ── Event calendar colours (applied via eventCss callback) ── */
  .svar-calendar-panel :global(.wx-box-event.cal-cours),
  .svar-calendar-panel :global(.wx-bar-event.cal-cours) {
    background-color: color-mix(in srgb, var(--syntax-keyword) 70%, var(--surface));
    color: var(--fg);
  }

  .svar-calendar-panel :global(.wx-box-event.cal-td),
  .svar-calendar-panel :global(.wx-bar-event.cal-td) {
    background-color: color-mix(in srgb, var(--syntax-number) 70%, var(--surface));
    color: var(--fg);
  }

  .svar-calendar-panel :global(.wx-box-event.cal-devoirs),
  .svar-calendar-panel :global(.wx-bar-event.cal-devoirs) {
    background-color: color-mix(in srgb, var(--syntax-string) 70%, var(--surface));
    color: var(--fg);
  }

  .svar-calendar-panel :global(.wx-box-event.cal-perso),
  .svar-calendar-panel :global(.wx-bar-event.cal-perso) {
    background-color: color-mix(in srgb, var(--syntax-constant) 70%, var(--surface));
    color: var(--fg);
  }

  /* ── Event priority indicators via eventCss ──────────── */
  .svar-calendar-panel :global(.ev-priority-high) {
    border-left: 3px solid var(--color-error, #f38ba8) !important;
  }

  .svar-calendar-panel :global(.ev-priority-low) {
    opacity: 0.7;
  }

  .svar-calendar-panel :global(.ev-has-location::after) {
    content: " \1F4CD";
    font-size: 10px;
  }

  /* ── Tooltip ─────────────────────────────────────────── */
  .svar-calendar-panel :global(.wx-calendar-tooltip) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fg) 12%, transparent);
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg);
  }

  /* ── All-day section ─────────────────────────────────── */
  .svar-calendar-panel :global(.wx-bar-section) {
    border-color: var(--border);
  }

  .svar-calendar-panel :global(.wx-bar-title) {
    color: var(--fg-muted);
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
  }

  /* ── Layout fixes ────────────────────────────────────── */
  .svar-calendar-panel :global(.wx-calendar) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .svar-calendar-panel :global(.wx-calendar-main) {
    flex: 1;
    min-height: 0;
  }

  /* ContextMenu wraps children in <span data-menu-ignore>.
     Must be a proper flex child or height chain breaks. */
  .svar-calendar-panel :global([data-menu-ignore]) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .svar-calendar-panel :global(.wx-calendar-sidebar) {
    flex-shrink: 0;
  }
</style>

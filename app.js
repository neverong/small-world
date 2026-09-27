/* Small World — functional prototype of the Figma "v2 · Iterated flows" (plus the v1 overlap, trip and account screens). */
(() => {
  "use strict";

  // ---------- Static data ----------
  const TODAY = "2026-06-05";
  const INVITE_LINK = "smallworld.app/i/nora";
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const PEOPLE = {
    me: { name: "Nora", avatar: "assets/avatar-me.png" },
    oliver: { name: "Oliver Cooper", short: "Oliver", avatar: "assets/oliver.png", close: true },
    jessica: { name: "Jessica M.", short: "Jessica", avatar: "assets/avatar-jessica.png" },
    emma: { name: "Emma Brown", short: "Emma", avatar: "assets/avatar-emma.png" },
    leo: { name: "Leo Park", short: "Leo" }, // no photo → placeholder avatar
  };
  const ALL_FRIENDS = ["oliver", "jessica", "emma", "leo"];

  // Friends' trips. A trip whose mood is "Just sharing" is visible but never creates an overlap.
  // Oliver's Lisbon and Mexico City trips come from frame B3. His Copenhagen trip stays in June so it
  // lines up with the June calendar and the Jun 7 – 11 overlap shown in C0 / C2.
  const FRIEND_TRIPS = [
    { id: "f1", who: "oliver", city: "Copenhagen, Denmark", start: "2026-06-07", end: "2026-06-16", mood: "open" },
    { id: "f4", who: "oliver", city: "Lisbon, Portugal", start: "2026-11-12", end: "2026-11-18", mood: "open" },
    { id: "f5", who: "oliver", city: "Mexico City, Mexico", start: "2026-12-20", end: "2027-01-03", mood: "open" },
    { id: "f2", who: "jessica", city: "Copenhagen, Denmark", start: "2026-06-10", end: "2026-06-13", mood: "sharing" },
    { id: "f3", who: "emma", city: "Miami, USA", start: "2026-08-16", end: "2026-08-18", mood: "open" },
    { id: "f6", who: "emma", city: "New York, USA", start: "2026-08-03", end: "2026-08-05", mood: "open" },
  ];

  const DESTINATIONS = [
    "Copenhagen, Denmark", "Miami, USA", "Lofoten, Norway", "Reykjavík, Iceland", "Lisbon, Portugal",
    "London, United Kingdom", "Paris, France", "Berlin, Germany", "Barcelona, Spain", "Rome, Italy",
    "Tokyo, Japan", "Seoul, South Korea", "Mexico City, Mexico", "New York, USA", "Los Angeles, USA",
    "Brooklyn, New York", "Amsterdam, Netherlands", "Stockholm, Sweden", "Oslo, Norway", "Athens, Greece",
  ];
  const PURPOSES = ["Vacation", "Visiting friends & family", "Business", "Working remotely", "Event or conference", "Other"];
  const MOODS = [["open", "Open to meet"], ["maybe", "Maybe"], ["sharing", "Just sharing"]];
  const LENGTHS = [["weekend", "A weekend", 2], ["week", "About a week", 7], ["two", "Two weeks or more", 14]];
  const VISIBILITY = [
    ["friends", "Friends", "All your friends can see it, and it can create overlaps with any of them."],
    ["close", "Close friends", "Only friends you’ve starred can see it and overlap with it."],
    ["me", "Just me", "Private. Nobody sees it and it won’t create overlaps until you change this."],
  ];
  const STEP_NO = { where: 1, when: 2, what: 3 };

  const SEED_TRIPS = [
    { id: "t1", city: "Copenhagen, Denmark", whenMode: "dates", start: "2026-06-05", end: "2026-06-11", month: 6, length: "week", purpose: "Vacation", mood: "open", visibility: "friends" },
    { id: "t2", city: "Lofoten, Norway", whenMode: "dates", start: "2026-06-11", end: "2026-06-17", month: 6, length: "week", purpose: "Vacation", mood: "open", visibility: "friends" },
    { id: "t3", city: "Reykjavík, Iceland", whenMode: "dates", start: "2026-06-17", end: "2026-06-19", month: 6, length: "weekend", purpose: "Vacation", mood: "maybe", visibility: "friends" },
  ];
  const SEED_PENDING = [
    { initials: "MC", name: "Maya Chen", sent: "Invite sent 2 days ago" },
    { initials: "SR", name: "Sam Rivera", sent: "Invite sent today" },
  ];

  const GLOW_SCREENS = new Set(["welcome", "invite", "oliverTrips", "form", "signup", "homeBase", "sayHi", "inviteFriends", "alerts", "signin"]);
  const STORAGE_KEY = "small-world-prototype-v2";

  // ---------- State ----------
  const freshState = () => ({
    screen: "welcome",
    stack: [],
    signedIn: false,
    invitedBy: null, // "oliver" when the person arrived through an invite link (flow B)
    friends: [],
    homeCity: "",
    homeDraft: "Brooklyn, New York",
    homeMode: "onboarding",
    alerts: true,
    alertsDraft: true,
    defaultVisibility: "friends",
    trips: [],
    draft: null,
    formStep: "where",
    formMode: "new",
    search: "",
    calMonth: "2026-06",
    expanded: {},
    filter: "all",
    overlapId: null,
    tripId: null,
    friendId: null,
    myName: "Nora",
    mePhoto: true,
    messages: {},
    pending: [],
    copied: false,
  });

  let state = load() || freshState();
  let ui = { sheet: null, sheetCtx: null, sheetValue: null, menuOpen: false, toast: null };
  let toastTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign(freshState(), JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Date helpers ----------
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const daysIncl = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
  const maxIso = (a, b) => (a > b ? a : b);
  const minIso = (a, b) => (a < b ? a : b);

  function fmtRange(a, b, { year = true, long = false } = {}) {
    const A = parse(a), B = parse(b);
    const names = long ? MONTHS_LONG : MONTHS_SHORT;
    const y = year ? `, ${B.getFullYear()}` : "";
    if (a === b) return `${names[A.getMonth()]} ${A.getDate()}${y}`;
    if (A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear()) return `${names[A.getMonth()]} ${A.getDate()} – ${B.getDate()}${y}`;
    return `${names[A.getMonth()]} ${A.getDate()} – ${names[B.getMonth()]} ${B.getDate()}${y}`;
  }

  const cityShort = (city) => city.split(",")[0];
  const normCity = (city) => String(city || "").trim().toLowerCase();
  // Names that refer to the same place for matching (Brooklyn is part of New York).
  const CITY_ALIASES = { "brooklyn, new york": "new york", "brooklyn": "new york", "new york, usa": "new york", "new york": "new york", "new york city": "new york" };
  const cityKey = (city) => CITY_ALIASES[normCity(city)] || normCity(city);
  const sameCity = (a, b) => cityKey(a) === cityKey(b);
  const destinationMatches = (text) => {
    const q = normCity(text);
    return q ? DESTINATIONS.filter((c) => c.toLowerCase().includes(q)) : [];
  };
  // Typed text → a known destination: exact match on full or short name, else the first suggestion, else the raw text.
  function resolveCity(text) {
    const q = normCity(text);
    if (!q) return "";
    const exact = DESTINATIONS.find((c) => normCity(c) === q || normCity(cityShort(c)) === q);
    return exact || destinationMatches(text)[0] || text.trim();
  }
  const lengthOf = (key) => LENGTHS.find((l) => l[0] === key) || LENGTHS[1];
  const moodLabel = (key) => (MOODS.find((m) => m[0] === key) || MOODS[0])[1];
  const visLabel = (key) => (VISIBILITY.find((v) => v[0] === key) || VISIBILITY[0])[1];

  function tripRange(t) {
    if (t.whenMode === "flex") {
      const m = String(t.month + 1).padStart(2, "0");
      const last = new Date(2026, t.month + 1, 0).getDate();
      return [`2026-${m}-01`, `2026-${m}-${last}`];
    }
    return [t.start, t.end || t.start];
  }
  const tripDays = (t) => (t.whenMode === "flex" ? lengthOf(t.length)[2] : daysIncl(...tripRange(t)));
  function tripDates(t, opts) {
    if (t.whenMode === "flex") return `Sometime in ${MONTHS_LONG[t.month]}`;
    return fmtRange(...tripRange(t), opts);
  }
  function tripDatesLong(t) {
    if (t.whenMode === "flex") return `Sometime in ${MONTHS_LONG[t.month]} · ${lengthOf(t.length)[1]}`;
    const n = daysIncl(...tripRange(t)) - 1;
    return `${fmtRange(...tripRange(t))} · ${n === 0 ? "Day trip" : `${n} ${n === 1 ? "night" : "nights"}`}`;
  }

  // ---------- Friends + overlaps ----------
  const friendTrips = () => FRIEND_TRIPS.filter((f) => state.friends.includes(f.who));
  // Overlaps come in two kinds:
  //  - trip overlaps: one of my trips and a friend's trip in the same city on the same days (o.trip is set)
  //  - home overlaps (G4): a friend visiting my home city, no trip of mine needed (o.home is true)
  function computeOverlaps(trips = state.trips) {
    const out = [];
    trips.forEach((t) => {
      if (t.visibility === "me" || t.mood === "sharing") return;
      const [ts, te] = tripRange(t);
      friendTrips().forEach((f) => {
        if (!sameCity(f.city, t.city) || f.mood === "sharing") return;
        if (t.visibility === "close" && !PEOPLE[f.who].close) return;
        const s = maxIso(ts, f.start), e = minIso(te, f.end);
        if (s <= e) out.push({ id: `${t.id}_${f.id}`, trip: t, friend: f, city: t.city, start: s, end: e });
      });
    });
    if (state.homeCity) {
      const awayTrips = trips.filter((t) => !sameCity(t.city, state.homeCity));
      friendTrips().forEach((f) => {
        if (f.mood === "sharing" || !sameCity(f.city, state.homeCity)) return;
        // Already an overlap with one of my trips (e.g. a Brooklyn trip) — don't show it twice.
        if (out.some((o) => o.friend.id === f.id)) return;
        // I'm away the whole time they're visiting.
        if (awayTrips.some((t) => { const [ts, te] = tripRange(t); return ts <= f.start && te >= f.end; })) return;
        out.push({ id: `home_${f.id}`, home: true, trip: null, friend: f, city: f.city, start: f.start, end: f.end });
      });
    }
    return out.sort((a, b) => (a.start < b.start ? -1 : 1));
  }
  const findOverlap = (id) => computeOverlaps().find((o) => o.id === id);
  const findTrip = (id) => state.trips.find((t) => t.id === id);
  const overlapsForTrip = (id) => computeOverlaps().filter((o) => o.trip && o.trip.id === id);
  const overlapTitle = (o) => (o.home ? `${PEOPLE[o.friend.who].name} is visiting your city` : `Overlap with ${PEOPLE[o.friend.who].name}`);
  const defaultMessage = (o) => o.home
    ? `Looks like you’re in ${cityShort(o.city)} from ${fmtRange(o.start, o.end, { year: false, long: true })}. Want to grab a coffee while you’re here?`
    : `Looks like we overlap in ${cityShort(o.city)} from ${fmtRange(o.start, o.end, { year: false, long: true })}. Want to grab a coffee or a drink?`;

  // ---------- Navigation ----------
  function closeOverlays() { ui.sheet = null; ui.sheetCtx = null; ui.menuOpen = false; }
  function go(screen) { state.stack.push(state.screen); state.screen = screen; closeOverlays(); render(); }
  function replace(screen) { state.screen = screen; closeOverlays(); render(); }
  function resetTo(screen) { state.stack = []; state.screen = screen; closeOverlays(); render(); }
  function back() {
    const prev = state.stack.pop();
    state.screen = prev || (state.signedIn ? "overlaps" : "welcome");
    closeOverlays();
    render();
  }
  function toast(msg) {
    ui.toast = { msg, key: Date.now() };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = null; render(); }, 2400);
    render();
  }

  function newDraft() {
    return { id: null, city: "", whenMode: "dates", start: null, end: null, month: 6, length: "week", purpose: null, mood: "open", visibility: state.defaultVisibility };
  }
  function startTrip() {
    state.draft = newDraft();
    state.formMode = "new";
    state.formStep = "where";
    state.search = "";
    state.calMonth = "2026-06";
    go("form");
  }
  function editTrip(id, step) {
    const t = findTrip(id);
    if (!t) return;
    state.draft = Object.assign({}, t);
    state.formMode = "edit";
    state.formStep = step || "where";
    state.search = t.city;
    state.calMonth = (t.start || "2026-06-01").slice(0, 7);
    go("form");
  }
  function submitDraft() {
    const d = state.draft;
    if (!d.purpose) d.purpose = PURPOSES[0];
    if (d.whenMode === "dates" && !d.end) d.end = d.start;
    if (state.formMode === "edit" || state.formMode === "onboarding-edit") {
      const i = state.trips.findIndex((t) => t.id === d.id);
      if (i >= 0) state.trips[i] = Object.assign({}, d);
      state.draft = null;
      if (state.formMode === "onboarding-edit") { state.formMode = "new"; replace("signup"); return; }
      back();
      toast("Trip updated");
      return;
    }
    d.id = `t${Date.now()}`;
    state.trips.push(Object.assign({}, d));
    state.draft = null;
    state.filter = "all";
    state.expanded = {};
    // Onboarding (A4 / B4 path): the trip is saved, then the account is created.
    if (!state.signedIn) { state.stack = []; replace("signup"); return; }
    // C3: "Add trip" closes the modal and the trip shows on home.
    const made = overlapsForTrip(d.id);
    resetTo("overlaps");
    toast(made.length ? `${made.length} new overlap${made.length > 1 ? "s" : ""}` : "Trip added");
  }
  function skipOnboarding() {
    // "Skip for now" on A2–A4 / B4 → sign up. Unsaved answers are dropped; a trip saved earlier (and being
    // re-edited from E5) stays saved.
    state.draft = null;
    state.formMode = "new";
    state.stack = [];
    replace("signup");
  }
  function signIn(from) {
    state.signedIn = true;
    if (from === "signin") {
      // A returning account: load its trips and friends if this browser has none yet.
      if (!state.trips.length && !state.friends.length) {
        state.trips = clone(SEED_TRIPS);
        state.friends = ALL_FRIENDS.slice();
        state.pending = SEED_PENDING.slice();
        state.homeCity = state.homeCity || "Brooklyn, New York";
      }
      if (state.invitedBy && !state.friends.includes(state.invitedBy)) state.friends.push(state.invitedBy);
      resetTo("overlaps");
      return;
    }
    if (state.invitedBy) {
      // B2 accepts the invite: the inviter becomes a friend.
      if (!state.friends.includes(state.invitedBy)) state.friends.push(state.invitedBy);
      state.stack = [];
      if (state.trips.length) resetTo("overlaps"); // secondary path lands on the first overlap
      else replace("oliverTrips"); // main path: B3
      return;
    }
    state.homeMode = "onboarding";
    state.homeDraft = state.homeCity || "Brooklyn, New York";
    state.alertsDraft = state.alerts;
    state.stack = [];
    replace("homeBase"); // A6
  }

  // ---------- Small render helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (name, size, cls = "") => `<span class="icon i${size} ${cls}"><img src="assets/${name}.svg" alt=""></span>`;
  // Avatar types (Figma Avatar 49:1539): Photo, Placeholder for anyone without a photo, Initials for pending invites only.
  const myName = () => state.myName || PEOPLE.me.name;
  function avatar(who, size = 32) {
    const p = PEOPLE[who];
    const name = who === "me" ? myName() : p.name;
    const photo = who === "me" ? (state.mePhoto === false ? null : p.avatar) : p.avatar;
    if (!photo) {
      const src = size <= 24 ? "assets/avatar-placeholder-sm.svg" : "assets/avatar-placeholder.svg";
      return `<span class="avatar av${size} placeholder"><img src="${src}" alt="${esc(name)}"></span>`;
    }
    return `<span class="avatar av${size}"><img src="${photo}" alt="${esc(name)}"></span>`;
  }
  const initialsAvatar = (txt) => `<span class="avatar av32 initials label-s">${esc(txt)}</span>`;
  const personRow = (av, title, subtitle, attrs = "") => `
    <div class="person-row" ${attrs}>${av}
      <div class="text"><p class="body-s">${esc(title)}</p><p class="label-s t-secondary">${esc(subtitle)}</p></div>
    </div>`;
  const dateBadge = (n) => `<span class="date-badge"><b>${n}</b><small>${n === 1 ? "Day" : "Days"}</small></span>`;
  const tripBody = (days, city, dates, attrs = "") => `
    <button class="trip-body tappable" ${attrs}>${dateBadge(days)}
      <span class="text"><span class="heading-m">${esc(city)}</span><span class="body-m">${esc(dates)}</span></span>
    </button>`;
  const fieldRow = (label, value, attrs) => `
    <button class="field-row" ${attrs}><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></button>`;
  const toggle = (on, action) => `
    <button class="toggle ${on ? "" : "off"}" role="switch" aria-checked="${on}" data-action="${action}">
      ${on ? '<img class="on" src="assets/toggle-on.svg" alt="">' : ""}
    </button>`;
  const listRow = (label, value, attrs, { chevron = true, danger = false } = {}) => `
    <button class="list-row" ${attrs}>
      <span class="l body-m ${danger ? "t-danger" : ""}">${esc(label)}</span>
      ${value != null ? `<span class="body-m t-secondary nowrap">${esc(value)}</span>` : ""}
      ${chevron ? icon("icon-chevron-down", 16, "rot-270") : ""}
    </button>`;
  // Back button (Icon/chevron-left), optionally with a visible label next to it (E5 "Edit trip").
  const backRow = (action, label, { visibleLabel = "" } = {}) => `
    <div class="top-row back-row">
      <button class="icon-btn" data-action="${action}" aria-label="${label}">${icon("icon-chevron-left", 20)}</button>
      ${visibleLabel ? `<span class="label-m">${esc(visibleLabel)}</span>` : ""}
    </div>`;
  const closeBtn = (action = "back", asset = "icon-close") =>
    `<div class="top-row"><button class="icon-btn" data-action="${action}" aria-label="Close">${icon(asset, 20)}</button></div>`;
  const authButtons = (from) => `
    <button class="btn secondary full" data-action="auth" data-from="${from}"><span class="ic20 google"><img src="assets/google-mark.png" alt=""></span>Continue with Google</button>
    <button class="btn secondary full" data-action="auth" data-from="${from}"><span class="ic20 apple"><img src="assets/icon-apple.svg" alt=""></span>Continue with Apple</button>`;
  const emptyState = (title, text, actions) => `
    <div class="empty">
      <div class="illu"><img src="assets/illustration-empty.svg" alt=""></div>
      <p class="display-l nowrap">${title}</p>
      <p class="body-m t-secondary">${text}</p>
      <div style="display:flex;flex-direction:column;gap:8px;padding-top:16px;width:100%">${actions}</div>
    </div>`;
  // The title is only a (chevron) button when there's a filter menu behind it.
  const topBar = (title, { menu = false } = {}) => `
    <div class="top-bar">
      ${menu
        ? `<button class="title" data-action="toggle-menu" aria-expanded="${ui.menuOpen}"><span class="heading-l nowrap">${esc(title)}</span>${icon("icon-chevron-down", 20, "chev")}</button>`
        : `<div class="title"><span class="heading-l nowrap">${esc(title)}</span></div>`}
      <button class="icon-btn" data-action="go" data-to="inviteFriends" aria-label="Invite friends">${icon("icon-add-friend", 20)}</button>
      ${menu ? filterMenu() : ""}
    </div>`;

  function filterMenu() {
    if (!ui.menuOpen) return "";
    const withOverlaps = [...new Set(computeOverlaps().map((o) => o.friend.who))];
    return `
      <div class="menu" role="menu">
        <button class="body-s ${state.filter === "all" ? "is-active" : ""}" data-action="filter" data-who="all">All friends</button>
        ${withOverlaps.map((w) => `<button class="body-s ${state.filter === w ? "is-active" : ""}" data-action="filter" data-who="${w}">${avatar(w, 20)}${esc(PEOPLE[w].name)}</button>`).join("")}
      </div>`;
  }

  function navBar(active) {
    const tab = (key, label, glyph) =>
      `<button class="tab ${active === key ? "is-active" : ""}" data-action="tab" data-to="${key}">${glyph}<span>${label}</span></button>`;
    return `
      <div class="footer"><div class="nav-row">
        <nav class="tab-bar">
          ${tab("overlaps", "Overlaps", icon("icon-overlaps", 20))}
          ${tab("friends", "Friends’ trips", icon("icon-globe", 20))}
          ${tab("you", "You", avatar("me", 20))}
        </nav>
        <button class="fab" data-action="new-trip" aria-label="Add trip">${icon("icon-plus", 24)}</button>
      </div></div>`;
  }

  function overlapCard(o, expanded) {
    const f = PEOPLE[o.friend.who];
    const city = cityShort(o.city);
    const body = tripBody(daysIncl(o.start, o.end), o.city, fmtRange(o.start, o.end), `data-action="say-hi" data-id="${o.id}"`);
    const me = o.home
      ? personRow(avatar("me"), `You’re home in ${cityShort(state.homeCity)}`, "Home city")
      : personRow(avatar("me"), `You’re in ${city}`, tripDates(o.trip, { year: false }));
    return `
      <article class="trip-card">
        <button class="hdr" data-action="toggle-overlap" data-id="${o.id}" aria-expanded="${!!expanded}">
          <span class="avatar-group">${avatar("me")}${avatar(o.friend.who)}</span>
          <span class="caption">${esc(overlapTitle(o))}</span>
          ${icon("icon-chevron-down", 16, `chev ${expanded ? "rot-180" : ""}`)}
        </button>
        ${expanded ? `
          <div class="people">
            ${me}
            ${personRow(avatar(o.friend.who), `${f.name} in ${city}`, fmtRange(o.friend.start, o.friend.end, { year: false }))}
          </div>
          <div class="divider"></div>
          <p class="caption t-secondary">You’ll both be in</p>
          ${body}` : `<div class="divider"></div>${body}`}
      </article>`;
  }

  // ---------- Screens ----------
  const screens = {
    // A1 · Welcome — found Small World on their own
    welcome() {
      return `
        <section class="screen">
          <div class="body centered">
            <div class="logo-100"><img src="assets/logo-mark.svg" alt="Small World"></div>
            <p class="display-xl center">Welcome to Small World</p>
            <p class="body-l center">See when you and your friends will be in the same place, privately, and only when it matters.</p>
          </div>
          <div class="footer">
            <button class="btn primary full" data-action="new-trip">Get started</button>
            <button class="btn tertiary full" data-action="go" data-to="signin">I already have an account</button>
          </div>
        </section>`;
    },

    // B1 · Invite — accept is the main action
    invite() {
      return `
        <section class="screen">
          <div class="body centered">
            ${avatar("oliver", 64)}
            <p class="display-xl center">Oliver invited you to Small World</p>
            <p class="body-l center">See when your travel plans overlap with friends, privately and only when it matters.</p>
          </div>
          <div class="footer">
            <button class="btn primary full" data-action="go" data-to="signup">Accept &amp; view Oliver’s travel dates</button>
            <button class="btn tertiary full" data-action="new-trip">Add your travel dates</button>
          </div>
        </section>`;
    },

    // B3 · Oliver's travel dates
    oliverTrips() {
      const who = state.invitedBy || "oliver";
      const p = PEOPLE[who];
      const trips = FRIEND_TRIPS.filter((f) => f.who === who);
      return `
        <section class="screen no-gap">
          <div class="body">
            <div class="heading-block">
              <p class="display-l">${esc(p.short)}’s travel dates</p>
              <p class="body-m t-secondary">You’re connected with ${esc(p.short)}. Only cities and dates are shared, never live location.</p>
            </div>
            <div class="card">
              ${trips.map((f) => personRow(avatar(who), f.city, `${p.name} · ${fmtRange(f.start, f.end, { year: false })}`)).join("")}
            </div>
          </div>
          <div class="footer">
            <button class="btn primary full" data-action="new-trip">Add your travel dates</button>
            <button class="btn tertiary full" data-action="go-home">Skip for now</button>
            <p class="caption t-secondary center">Add a trip to see where your plans overlap with ${esc(p.short)}’s.</p>
          </div>
        </section>`;
    },

    form() {
      const d = state.draft || (state.draft = newDraft());
      const step = state.formStep;
      // Onboarding (signed out, A2–A4 / B4) is a full page; after sign-in it's a full-screen modal (C1–C3).
      const modal = state.signedIn;
      const whenValue = d.whenMode === "flex"
        ? `${MONTHS_LONG[d.month]} · ${lengthOf(d.length)[1]}`
        : d.start ? fmtRange(d.start, d.end || d.start) : "Add dates";
      const whatValue = d.purpose ? `${d.purpose} · ${moodLabel(d.mood)}` : "Trip type & mood";
      const parts = [];

      if (modal) {
        parts.push(`
          <div class="top-bar modal-top">
            <p class="label-m">${state.formMode === "edit" ? "Edit trip" : "New trip"} · ${STEP_NO[step]} of 3</p>
            <button class="icon-btn" data-action="close-form" aria-label="Close">${icon("icon-close", 20)}</button>
          </div>`);
      } else {
        parts.push(backRow("exit-onboarding", state.invitedBy ? "Back to invite" : "Back to welcome"));
      }

      if (step === "where") {
        if (state.formMode === "new") {
          const [title, text] = modal
            ? ["Add a trip", "We’ll let you know when friends’ plans cross it. Only people you choose can see it."]
            : state.invitedBy
              ? ["Where are you headed?", `Add a trip and we’ll check it against ${PEOPLE[state.invitedBy].short}’s plans. It stays private until you choose who can see it.`]
              : ["Where are you headed next?", "Add a trip so we can spot when friends are nearby. It stays private until you choose who can see it."];
          parts.push(`
            <div class="heading-block">
              <p class="display-m">${title}</p>
              <p class="body-m">${esc(text)}</p>
            </div>`);
        }
        parts.push(whereCard(d));
      } else {
        parts.push(fieldRow("Where", d.city, `data-action="step" data-step="where"`));
      }
      parts.push(step === "when" ? whenCard(d) : fieldRow("When", whenValue, `data-action="step" data-step="when"`));
      parts.push(step === "what" ? whatCard(d) : fieldRow("What", whatValue, `data-action="step" data-step="what"`));
      if (step === "what") parts.push(fieldRow("Who can see it", visLabel(d.visibility), `data-action="open-visibility" data-ctx="draft"`));

      let primary = "Next";
      if (step === "what") primary = !modal ? "Save trip &amp; continue" : state.formMode === "edit" ? "Save trip" : "Add trip";
      const secondary = modal
        ? `<button class="btn tertiary sm" data-action="clear-form">Clear all</button>`
        : `<button class="btn tertiary sm" data-action="skip-onboarding">Skip for now</button>`;
      return `
        <section class="screen ${modal ? "modal" : ""}">
          <div class="body">${parts.join("")}</div>
          <div class="footer"><div class="actions-row">
            ${secondary}
            <button class="btn primary sm" data-action="form-next">${primary}</button>
          </div></div>
        </section>`;
    },

    // A5 · Sign up (trip saved or skipped) / B2 · Sign up (accept invite)
    signup() {
      const trip = state.trips[state.trips.length - 1];
      let title, text;
      if (state.invitedBy) {
        const p = PEOPLE[state.invitedBy];
        title = `Accept ${p.short}’s invite`;
        text = `Create an account to connect with ${p.short} and see where they’re headed.`;
      } else if (trip) {
        title = "Save your trip";
        text = `Create an account to keep your ${cityShort(trip.city)} trip and see when friends’ plans cross yours.`;
      } else {
        title = "Create your account";
        text = "Create an account to see when friends’ plans cross yours.";
      }
      return `
        <section class="screen">
          ${trip && !state.signedIn
            ? backRow("signup-back", "Edit trip", { visibleLabel: "Edit trip" })
            : state.invitedBy ? backRow("signup-back", "Back to invite") : ""}
          <div class="body centered" style="gap:16px">
            <p class="display-xl center">${esc(title)}</p>
            <p class="body-l center">${esc(text)}</p>
          </div>
          <div class="footer gap-12">
            ${authButtons("signup")}
            <button class="btn secondary full" data-action="auth" data-from="signup"><span class="ic20 mail"><img src="assets/icon-mail.svg" alt=""></span>Continue with email</button>
            <button class="btn tertiary full" data-action="go" data-to="signin">I already have an account</button>
            <p class="caption t-secondary center">By tapping Continue, you agree to our Terms and Privacy Policy.</p>
          </div>
        </section>`;
    },

    // A6 · Home base
    homeBase() {
      const edit = state.homeMode === "edit";
      return `
        <section class="screen">
          <div class="body">
            <div class="heading-block">
              <p class="display-l">Where’s home?</p>
              <p class="body-m">Friends passing through your city count as overlaps too. Only your city is shared, never your live location.</p>
            </div>
            <div class="card">
              <p class="heading-m">Home city</p>
              <label class="input">${icon("icon-location-input", 18)}
                <input data-input="home" data-key="home" value="${esc(state.homeDraft)}" placeholder="Your city" autocomplete="off" />
              </label>
            </div>
            <div class="card">
              <div class="link-row" style="gap:16px">
                <div style="flex:1 0 0;display:flex;flex-direction:column;gap:4px">
                  <p class="label-m">Tell me when friends pass through</p>
                  <p class="body-s t-secondary">One heads-up per overlap. No spam.</p>
                </div>
                ${toggle(state.alertsDraft, "toggle-alerts-draft")}
              </div>
            </div>
          </div>
          <div class="footer">
            <button class="btn primary full" data-action="save-home">${edit ? "Save" : "Continue"}</button>
            <button class="btn tertiary full" data-action="${edit ? "back" : "skip-home"}">${edit ? "Cancel" : "Skip for now"}</button>
          </div>
        </section>`;
    },

    // C0 / 07 / 08 home, A7 (trip, no friends), D1 (no trips), 07b (no overlaps yet)
    overlaps() {
      const all = computeOverlaps();
      const hasFriends = state.friends.length > 0;
      const friendsWith = [...new Set(all.map((o) => o.friend.who))];
      if (state.filter !== "all" && !friendsWith.includes(state.filter)) state.filter = "all";
      const list = state.filter === "all" ? all : all.filter((o) => o.friend.who === state.filter);
      const last = state.trips[state.trips.length - 1];

      let title = state.filter === "all" ? "All friends" : PEOPLE[state.filter].name;
      let content;
      if (list.length) {
        // Trip overlaps and home-city visits (G4) — a home visit needs no trip of mine.
        content = list.map((o) => overlapCard(o, state.expanded[o.id])).join("");
      } else if (!state.trips.length) {
        title = "Overlaps";
        content = emptyState("Start with a trip",
          "Add where you’re headed next, then invite a few friends. When your plans cross, it shows up here.",
          `<button class="btn primary full" data-action="new-trip">Add a trip</button>
           <button class="btn tertiary full" data-action="go" data-to="inviteFriends">Invite friends</button>`);
      } else if (!hasFriends) {
        title = "Overlaps";
        content = emptyState("Invite your people",
          `Your ${esc(cityShort(last.city))} trip is saved. Invite a few friends — when their plans cross yours, it shows up here.`,
          `<button class="btn primary full" data-action="go" data-to="inviteFriends">Invite friends</button>
           <button class="btn tertiary full" data-action="new-trip">Add another trip</button>`);
      } else {
        content = emptyState("No overlaps yet",
          `Your ${esc(cityShort(last.city))} trip is saved. When a friend adds plans that cross yours, it shows up here and we’ll let you know.`,
          `<button class="btn primary full" data-action="go" data-to="inviteFriends">Invite friends</button>
           <button class="btn tertiary full" data-action="new-trip">Add another trip</button>`);
      }
      return `
        <section class="screen no-gap">
          <div class="body">
            ${topBar(title, { menu: all.length > 0 })}
            ${content}
          </div>
          ${navBar("overlaps")}
        </section>`;
    },

    sayHi() {
      const o = findOverlap(state.overlapId);
      if (!o) return screens.overlaps();
      const msg = state.messages[o.id] != null ? state.messages[o.id] : defaultMessage(o);
      return `
        <section class="screen">
          <div class="body" style="justify-content:space-between">
            <div class="summary">
              <div class="top-row" style="width:100%"><button class="icon-btn" data-action="back" aria-label="Close">${icon("icon-close", 20)}</button></div>
              <div class="avatar-group xl">${avatar("me", 64)}${avatar(o.friend.who, 64)}</div>
              <div class="spacer"></div>
              <p class="caption t-secondary center">${esc(overlapTitle(o))}</p>
              <p class="heading-m center">${esc(o.city)}</p>
              <p class="heading-m center">${fmtRange(o.start, o.end)}</p>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <p class="caption t-secondary">Suggested message · Tap to edit</p>
              <textarea class="message-box" data-input="message" data-key="message" aria-label="Message">${esc(msg)}</textarea>
            </div>
          </div>
          <div class="footer"><button class="btn primary full" data-action="open-share">Looks good, share</button></div>
        </section>`;
    },

    inviteFriends() {
      return `
        <section class="screen no-gap">
          <div class="body">
            ${closeBtn()}
            <div class="heading-block" style="padding:0">
              <p class="display-l">Bring your people</p>
              <p class="body-m">Small World only works with friends. Anyone who joins with your link becomes your friend, and you see each other’s trips.</p>
            </div>
            <div class="card gap-12">
              <p class="caption t-secondary">Your invite link</p>
              <div class="link-row">
                <p class="body-m">${INVITE_LINK}</p>
                <button class="btn secondary sm" data-action="copy-link">${state.copied ? "Copied" : "Copy"}</button>
              </div>
            </div>
            ${state.pending.length ? `
              <div class="card gap-12">
                <p class="heading-m">Waiting to join</p>
                ${state.pending.map((p) => personRow(initialsAvatar(p.initials), p.name, p.sent)).join("")}
              </div>` : ""}
          </div>
          <div class="footer">
            <button class="btn primary full" data-action="share-link">Share invite link</button>
            <p class="caption t-secondary center">Links expire after 7 days. You can remove a friend anytime.</p>
          </div>
        </section>`;
    },

    // 12 · Friends / D2 · Friends' trips — no friends
    friends() {
      if (!state.friends.length) {
        return `
          <section class="screen no-gap">
            <div class="body">
              ${topBar("Friends’ trips")}
              ${emptyState("No friends here yet",
                "Invite friends to see where they’re headed. You’ll only ever see cities and dates.",
                `<button class="btn primary full" data-action="go" data-to="inviteFriends">Invite friends</button>`)}
            </div>
            ${navBar("friends")}
          </section>`;
      }
      const summary = (who) => {
        // Soonest upcoming trip.
        const f = FRIEND_TRIPS.filter((t) => t.who === who && t.end >= TODAY).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
        return f ? `${cityShort(f.city)} · ${fmtRange(f.start, f.end, { year: false })}` : "No upcoming trips";
      };
      return `
        <section class="screen no-gap">
          <div class="body">
            ${topBar("Friends")}
            <div class="card">${state.friends.map((w) => `
              <button class="friend-row" data-action="open-friend" data-who="${w}" aria-label="${esc(PEOPLE[w].name)}">
                ${personRow(avatar(w), PEOPLE[w].name, summary(w))}
                ${icon("icon-chevron-right", 20)}
              </button>`).join("")}</div>
            ${state.pending.length ? `
              <p class="overline t-secondary">Waiting to join</p>
              <div class="card">${state.pending.map((p) => personRow(initialsAvatar(p.initials), p.name, p.sent)).join("")}</div>` : ""}
          </div>
          ${navBar("friends")}
        </section>`;
    },

    // G2 · Friend — their trips, overlaps with them first
    friend() {
      const who = state.friendId;
      if (!who || !state.friends.includes(who)) return screens.friends();
      const p = PEOPLE[who];
      const overlaps = computeOverlaps().filter((o) => o.friend.who === who);
      const inOverlap = new Set(overlaps.map((o) => o.friend.id));
      const trips = FRIEND_TRIPS.filter((f) => f.who === who);
      const others = trips.filter((f) => !inOverlap.has(f.id)).sort((a, b) => (a.start < b.start ? -1 : 1));
      const count = trips.length;
      const since = `Friends since Sep 2026${count ? ` · ${count} upcoming ${count === 1 ? "trip" : "trips"}` : ""}`;
      const cards = overlaps.map((o) => overlapCard(o, state.expanded[o.id])).join("") +
        others.map((f) => `<article class="trip-card">${tripBody(daysIncl(f.start, f.end), f.city, fmtRange(f.start, f.end), "disabled")}</article>`).join("");
      return `
        <section class="screen no-gap">
          <div class="body" style="gap:12px">
            ${backRow("back", "Back")}
            <div class="heading-block tight">
              ${avatar(who, 64)}
              <p class="overline t-secondary">Friend</p>
              <p class="display-l">${esc(p.name)}</p>
              <p class="body-m t-secondary">${since}</p>
            </div>
            <p class="overline t-secondary">Upcoming trips</p>
            ${cards || `<p class="body-s t-secondary">No upcoming trips</p>`}
          </div>
          <div class="footer">
            <button class="btn tertiary full danger-text" data-action="open-remove-friend">Remove friend</button>
          </div>
        </section>`;
    },

    tripDetail() {
      const t = findTrip(state.tripId);
      if (!t) return screens.you();
      const overlaps = overlapsForTrip(t.id);
      return `
        <section class="screen no-gap">
          <div class="body">
            ${closeBtn()}
            <div class="heading-block tight">
              <p class="overline t-secondary">Your trip</p>
              <p class="display-l">${esc(t.city)}</p>
              <p class="body-m t-secondary">${esc(tripDatesLong(t))}</p>
            </div>
            <div class="card list">
              ${listRow("Dates", t.whenMode === "flex" ? MONTHS_LONG[t.month] : tripDates(t, { year: false }), `data-action="edit-trip" data-step="when"`)}
              <div class="divider"></div>
              ${listRow("Purpose", t.purpose, `data-action="edit-trip" data-step="what"`)}
              <div class="divider"></div>
              ${listRow("Mood", moodLabel(t.mood), `data-action="edit-trip" data-step="what"`)}
              <div class="divider"></div>
              ${listRow("Who can see it", visLabel(t.visibility), `data-action="open-visibility" data-ctx="trip"`)}
            </div>
            <p class="overline t-secondary">Overlaps on this trip</p>
            ${overlaps.length ? overlaps.map((o) => overlapCard(o, state.expanded[o.id])).join("") : `<p class="body-s t-secondary">No overlaps on this trip yet. We’ll let you know when a friend’s plans cross yours.</p>`}
          </div>
          <div class="footer">
            <button class="btn secondary full" data-action="edit-trip" data-step="where">Edit trip</button>
            <button class="btn tertiary full danger-text" data-action="open-delete-trip">Delete trip</button>
          </div>
        </section>`;
    },

    alerts() {
      const notif = (body, time, attrs) => `
        <button class="notif tappable" ${attrs}>
          <span class="logo"><img src="assets/globe.svg" alt=""></span>
          <span class="txt">
            <span class="row"><span class="label-m">Small World</span><span class="caption t-secondary">${time}</span></span>
            <span class="body-s">${esc(body)}</span>
          </span>
        </button>`;
      // One notification per real overlap (soonest first), each opening that overlap's Say hi screen.
      const alertText = (o) => {
        const who = PEOPLE[o.friend.who].short, dates = fmtRange(o.start, o.end, { year: false });
        return o.home
          ? `${who} is in ${cityShort(o.city)} ${dates}, near your home in ${cityShort(state.homeCity)}. Coffee?`
          : `You and ${who} are both in ${cityShort(o.city)}, ${dates}. Say hi?`;
      };
      const items = computeOverlaps().slice(0, 3).map((o, i) =>
        notif(alertText(o), ["now", "2h ago", "Yesterday"][i], `data-action="say-hi" data-id="${o.id}"`)).join("");
      // E3: a card on the lock screen when there's nothing to show.
      const notice = (title, text, primary) => `
        <div class="notice-card">
          <p class="notice-title">${title}</p>
          <p class="notice-body">${text}</p>
          ${primary}
          <button class="btn tertiary sm full" data-action="go-home">Open Small World</button>
        </div>`;
      const content = !state.alerts
        ? notice("Overlap alerts are off",
            "You won’t hear when a friend’s plans cross yours. Turn alerts on to get one heads-up per overlap.",
            `<button class="btn primary sm full" data-action="go" data-to="settings">Turn on in Settings</button>`)
        : items || notice("No alerts yet", "When a friend’s plans cross yours, you’ll get one heads-up here.", "");
      const today = parse(TODAY).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      return `
        <section class="screen no-gap">
          <div class="body">
            <div class="clock">
              <p class="label-m">${today}</p>
              <p class="display-xl">9:41</p>
            </div>
            ${content}
          </div>
        </section>`;
    },

    signin() {
      return `
        <section class="screen no-gap">
          ${state.stack.length ? closeBtn().replace('class="top-row"', 'class="top-row" style="position:absolute;top:59px;right:18px;z-index:2"') : ""}
          <div class="body centered" style="gap:16px">
            <div class="logo-100"><img src="assets/logo-mark.svg" alt="Small World"></div>
            <p class="display-xl center">Welcome back</p>
            <p class="body-l center">Sign in to see your trips and where they cross your friends’ plans.</p>
          </div>
          <div class="footer gap-12">
            ${authButtons("signin")}
            <button class="btn tertiary full" data-action="auth" data-from="signin">Use email instead</button>
            <button class="btn tertiary full" data-action="new-here">New here? Create an account</button>
          </div>
        </section>`;
    },

    // 19 · You / D3 · You — no trips
    you() {
      const overlaps = computeOverlaps();
      const trips = state.trips.slice().sort((a, b) => (tripRange(a)[0] < tripRange(b)[0] ? -1 : 1));
      const cards = trips.map((t) => {
        const o = overlaps.find((x) => x.trip && x.trip.id === t.id);
        const body = tripBody(tripDays(t), t.city, tripDates(t), `data-action="open-trip" data-id="${t.id}"`);
        if (!o) return `<article class="trip-card">${body}</article>`;
        return `
          <article class="trip-card">
            <button class="hdr" data-action="open-trip" data-id="${t.id}">
              <span class="avatar-group">${avatar("me")}${avatar(o.friend.who)}</span>
              <span class="caption">Overlap with ${esc(PEOPLE[o.friend.who].name)}</span>
              ${icon("icon-expand-right", 16)}
            </button>
            <div class="divider"></div>${body}
          </article>`;
      }).join("");
      const empty = `
        <div class="empty" style="flex:0 0 auto;padding-top:48px">
          <div class="illu"><img src="assets/illustration-empty.svg" alt=""></div>
          <p class="display-l nowrap">No trips yet</p>
          <p class="body-m t-secondary">Add your next trip and we’ll watch for friends heading the same way.</p>
          <div style="display:flex;flex-direction:column;gap:8px;padding-top:16px;width:100%">
            <button class="btn primary full" data-action="new-trip">Add a trip</button>
          </div>
        </div>`;
      return `
        <section class="screen no-gap">
          <div class="body">
            <div class="profile">
              ${avatar("me", 64)}
              <div class="txt"><p class="heading-l">${esc(myName())}</p><p class="body-s t-secondary">${state.homeCity ? `Based in ${esc(state.homeCity)}` : "No home city yet"}</p></div>
              <button class="btn secondary sm" data-action="go" data-to="settings">Settings</button>
            </div>
            <p class="overline t-secondary">Upcoming trips · ${trips.length}</p>
            ${cards || empty}
          </div>
          ${navBar("you")}
        </section>`;
    },

    settings() {
      return `
        <section class="screen no-gap">
          <div class="body">
            <div class="top-bar">
              <div class="title"><span class="heading-l">Settings</span></div>
              <button class="icon-btn" data-action="back" aria-label="Close">${icon("settings-close", 20)}</button>
            </div>
            <div class="card list">
              ${listRow("Home city", state.homeCity || "Not set", `data-action="edit-home"`)}
              <div class="divider"></div>
              <div class="list-row toggle-row"><span class="l body-m">Overlap alerts</span>${toggle(state.alerts, "toggle-alerts")}</div>
            </div>
            <div class="card list">
              ${listRow("Default trip visibility", visLabel(state.defaultVisibility), `data-action="open-visibility" data-ctx="default"`)}
              <div class="divider"></div>
              ${listRow("Friends", String(state.friends.length), `data-action="tab" data-to="friends"`)}
            </div>
            <div class="card list">
              ${listRow("Sign out", null, `data-action="sign-out"`, { chevron: false })}
              <div class="divider"></div>
              ${listRow("Delete account", null, `data-action="open-delete-account"`, { chevron: false, danger: true })}
            </div>
          </div>
          <div class="footer"><p class="caption t-tertiary center">Small World · Version 0.1</p></div>
        </section>`;
    },
  };

  // ---------- Add-trip form sections ----------
  function whereCard(d) {
    const showSuggest = state.search.trim() && state.search !== d.city;
    const matches = showSuggest ? destinationMatches(state.search).slice(0, 4) : [];
    const suggestion = (city, sub) => `
      <button data-action="pick-city" data-city="${esc(city)}">
        <span class="icon-tile">${icon("icon-location", 18)}</span>
        <span class="stack2"><span class="label-s">${esc(cityShort(city))}</span><span class="caption t-secondary">${esc(sub)}</span></span>
      </button>`;
    let below;
    if (showSuggest) {
      below = `<div class="suggestions">${
        matches.length
          ? matches.map((c) => suggestion(c, c.split(",").slice(1).join(",").trim())).join("")
          : suggestion(state.search.trim(), "Use this destination")
      }</div>`;
    } else if (d.city) {
      below = `<p class="caption t-secondary">Destination set. Tap Next to add dates.</p>`;
    } else {
      const home = state.homeCity || "Brooklyn, New York";
      below = `
        <button class="link-row" data-action="pick-city" data-city="${esc(home)}" style="gap:12px">
          <span class="icon-tile">${icon("icon-location", 18)}</span>
          <span class="stack2"><span class="label-s">Current location</span><span class="caption t-secondary">${esc(home)}</span></span>
        </button>`;
    }
    return `
      <div class="card">
        <p class="heading-l">Where?</p>
        <label class="input">${icon("icon-search", 18)}
          <input data-input="search" data-key="search" value="${esc(state.search)}" placeholder="Search destinations" autocomplete="off" />
        </label>
        ${below}
      </div>`;
  }

  function whenCard(d) {
    const seg = `
      <div class="segmented">
        <button class="${d.whenMode === "dates" ? "is-selected" : ""}" data-action="when-mode" data-mode="dates">Dates</button>
        <button class="${d.whenMode === "flex" ? "is-selected" : ""}" data-action="when-mode" data-mode="flex">Flexible</button>
      </div>`;
    if (d.whenMode === "flex") {
      const monthChips = [5, 6, 7, 8, 9].map((m) =>
        `<button class="chip ${d.month === m ? "is-selected" : ""}" data-action="flex-month" data-m="${m}">${MONTHS_LONG[m]}</button>`).join("");
      const lenChips = LENGTHS.map(([k, label]) =>
        `<button class="chip ${d.length === k ? "is-selected" : ""}" data-action="flex-length" data-k="${k}">${label}</button>`).join("");
      return `
        <div class="card">
          <p class="heading-l">When?</p>${seg}
          <p class="body-s t-secondary">Roughly when?</p><div class="chips">${monthChips}</div>
          <p class="body-s t-secondary">For how long?</p><div class="chips">${lenChips}</div>
          <p class="caption t-secondary">We’ll look for friends in ${esc(cityShort(d.city || "your destination"))} any time in ${MONTHS_LONG[d.month]}. You can set exact dates later.</p>
        </div>`;
    }
    return `<div class="card"><p class="heading-l">When?</p>${seg}${calendar(d)}</div>`;
  }

  function calendar(d) {
    const [y, m] = state.calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const count = new Date(y, m, 0).getDate();
    const cells = Array(first).fill(null).concat(Array.from({ length: count }, (_, i) => i + 1));
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const s = d.start, e = d.end;
    const day = (n) => {
      if (!n) return `<span class="cal-day" aria-hidden="true"></span>`;
      const k = `${y}-${String(m).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
      const cls = k === s || k === e ? "is-selected" : s && e && k > s && k < e ? "in-range" : "";
      return `<button class="cal-day ${cls}" data-action="pick-day" data-day="${k}" ${k < TODAY ? "disabled" : ""}>${n}</button>`;
    };
    const atMin = state.calMonth <= TODAY.slice(0, 7);
    const atMax = state.calMonth >= "2027-05";
    return `
      <div class="cal-head">
        <p class="label-m">${MONTHS_LONG[m - 1]} ${y}</p>
        <div class="cal-nav">
          <button data-action="cal-prev" aria-label="Previous month" ${atMin ? "disabled" : ""}>${icon("icon-chevron-down", 16, "rot-90")}</button>
          <button data-action="cal-next" aria-label="Next month" ${atMax ? "disabled" : ""}>${icon("icon-chevron-down", 16, "rot-270")}</button>
        </div>
      </div>
      <div class="cal">
        <div class="cal-week">${["S", "M", "T", "W", "T", "F", "S"].map((w) => `<span class="cal-wd">${w}</span>`).join("")}</div>
        ${weeks.map((w) => `<div class="cal-week">${w.map(day).join("")}</div>`).join("")}
      </div>`;
  }

  function whatCard(d) {
    if (!d.purpose) d.purpose = PURPOSES[0];
    return `
      <div class="card">
        <p class="heading-l">What?</p>
        <p class="body-s t-secondary">Trip purpose</p>
        <div class="chips">${PURPOSES.map((p) => `<button class="chip ${d.purpose === p ? "is-selected" : ""}" data-action="purpose" data-p="${esc(p)}">${esc(p)}</button>`).join("")}</div>
        <p class="body-s t-secondary">Mood for this trip</p>
        <div class="segmented">${MOODS.map(([k, l]) => `<button class="${d.mood === k ? "is-selected" : ""}" data-action="mood" data-k="${k}">${l}</button>`).join("")}</div>
      </div>`;
  }

  // ---------- Sheets ----------
  function renderSheet() {
    if (!ui.sheet) return "";
    let inner = "";
    if (ui.sheet === "visibility") {
      inner = `
        <div class="sheet">
          <span class="grabber"></span>
          <div class="w" style="display:flex;flex-direction:column;gap:6px">
            <p class="heading-l">${ui.sheetCtx === "default" ? "Who can see new trips?" : "Who can see this trip?"}</p>
            <p class="body-s t-secondary">Only the city and dates are shared. Never your live location.</p>
          </div>
          ${VISIBILITY.map(([k, title, desc]) => `
            <button class="option-card ${ui.sheetValue === k ? "is-selected" : ""}" data-action="pick-visibility" data-k="${k}" role="radio" aria-checked="${ui.sheetValue === k}">
              <span class="radio">${ui.sheetValue === k ? '<img src="assets/radio-selected.svg" alt="">' : ""}</span>
              <span class="txt"><span class="label-m">${title}</span><span class="body-s t-secondary">${desc}</span></span>
            </button>`).join("")}
          <button class="btn primary full" data-action="save-visibility">Done</button>
        </div>`;
    } else if (ui.sheet === "share") {
      const o = findOverlap(state.overlapId);
      const msg = o ? (state.messages[o.id] != null ? state.messages[o.id] : defaultMessage(o)) : "";
      const text = encodeURIComponent(msg);
      inner = `
        <div class="sheet share">
          <span class="grabber"></span>
          <p class="label-m w">Share overlap message via…</p>
          <div class="share-apps">
            <a href="sms:&body=${text}" data-action="shared" data-app="iMessage"><span class="app"><img src="assets/app-imessage.png" alt=""></span><span class="body-s">iMessage</span></a>
            <a href="https://wa.me/?text=${text}" target="_blank" rel="noopener" data-action="shared" data-app="WhatsApp"><span class="app"><img src="assets/app-whatsapp.png" alt=""></span><span class="body-s">WhatsApp</span></a>
          </div>
        </div>`;
    } else if (ui.sheet === "removeFriend") {
      // G3 · Remove friend?
      const p = PEOPLE[state.friendId];
      const cities = [...new Set(computeOverlaps().filter((o) => o.friend.who === state.friendId).map((o) => cityShort(o.city)))];
      const overlapLine = cities.length
        ? `, and your ${cities.length > 1 ? "overlaps" : "overlap"} in ${cities.join(" and ")} will disappear`
        : "";
      inner = `
        <div class="sheet">
          <span class="grabber"></span>
          <div class="w" style="display:flex;flex-direction:column;gap:8px">
            <p class="heading-l">Remove ${esc(p.short)}?</p>
            <p class="body-m t-secondary">You’ll stop seeing each other’s trips${overlapLine}. ${esc(p.short)} isn’t notified. You can reconnect with a new invite link.</p>
          </div>
          <div class="w" style="display:flex;flex-direction:column;gap:8px">
            <button class="btn danger full" data-action="confirm-remove-friend">Remove friend</button>
            <button class="btn tertiary full" data-action="close-sheet">Keep ${esc(p.short)}</button>
          </div>
        </div>`;
    } else if (ui.sheet === "deleteTrip" || ui.sheet === "deleteAccount") {
      const isTrip = ui.sheet === "deleteTrip";
      let body = "Your trips, overlaps and friends will be removed. This can’t be undone.";
      if (isTrip) {
        const t = findTrip(state.tripId);
        const o = t && overlapsForTrip(t.id)[0];
        body = o
          ? `Friends will no longer see it, and your overlap with ${PEOPLE[o.friend.who].short} in ${cityShort(t.city)} will disappear. This can’t be undone.`
          : "Friends will no longer see it. This can’t be undone.";
      }
      inner = `
        <div class="sheet">
          <span class="grabber"></span>
          <div class="w" style="display:flex;flex-direction:column;gap:8px">
            <p class="heading-l">${isTrip ? "Delete this trip?" : "Delete your account?"}</p>
            <p class="body-m t-secondary">${esc(body)}</p>
          </div>
          <div class="w" style="display:flex;flex-direction:column;gap:8px">
            <button class="btn danger full" data-action="${isTrip ? "confirm-delete-trip" : "confirm-delete-account"}">${isTrip ? "Delete trip" : "Delete account"}</button>
            <button class="btn tertiary full" data-action="close-sheet">${isTrip ? "Keep trip" : "Keep account"}</button>
          </div>
        </div>`;
    }
    return `<div class="scrim" data-action="close-sheet"></div>${inner}`;
  }

  // ---------- Render ----------
  const device = document.getElementById("device");
  const panel = document.getElementById("panel");

  function render() {
    // Preserve focus/caret for inputs across re-renders.
    const active = document.activeElement;
    const focusKey = active && active.dataset ? active.dataset.key : null;
    const caret = focusKey && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
    const scroller = device.querySelector(".body");
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const prevScreen = device.dataset.screen;

    const fn = screens[state.screen] || screens.welcome;
    device.innerHTML = `
      <div class="chrome">${GLOW_SCREENS.has(state.screen) ? '<div class="glow"></div>' : ""}</div>
      ${fn()}
      ${renderSheet()}
      <div class="status-bar"><span class="time">9:41</span><img class="levels" src="assets/levels.svg" alt=""></div>
      <div class="home-indicator"></div>
      ${ui.toast ? `<div class="toast" role="status">${esc(ui.toast.msg)}</div>` : ""}`;

    // Animate only when the screen changes; keep scroll only when the form step is unchanged too.
    const screenKey = `${state.screen}:${state.formStep}`;
    const sec = device.querySelector(".screen");
    const sameScreen = prevScreen && prevScreen.split(":")[0] === state.screen;
    if (sameScreen && sec) sec.style.animation = "none";
    device.dataset.screen = screenKey;
    const body = device.querySelector(".body");
    if (body && prevScreen === screenKey) body.scrollTop = scrollTop;

    // Keep the toast clear of the footer's buttons.
    const toastEl = device.querySelector(".toast");
    const footer = device.querySelector(".screen .footer");
    if (toastEl && footer) toastEl.style.bottom = `${852 - footer.offsetTop + 12}px`;

    if (focusKey) {
      const el = device.querySelector(`[data-key="${focusKey}"]`);
      if (el) { el.focus(); if (caret) el.setSelectionRange(caret[0], caret[1]); }
    }
    renderPanel();
    save();
  }

  // ---------- Side panel: jump to any Figma frame ----------
  const FRAMES = [
    ["A · Found it on their own", [
      ["A1", "Welcome"], ["A2", "Where"], ["A3", "When"], ["A4", "What"], ["A5", "Sign up"], ["A6", "Home base"], ["A7", "Home · no friends"],
    ]],
    ["B · Invited by Oliver", [
      ["B1", "Invite"], ["B2", "Sign up (accept)"], ["B3", "Oliver’s dates"], ["B4", "Your dates first"],
    ]],
    ["C · Adding a trip after sign-in", [
      ["C0", "Home"], ["C1", "Modal · Where"], ["C2", "Modal · When"], ["C3", "Modal · What"],
    ]],
    ["D · New account, nothing yet", [
      ["D1", "Overlaps"], ["D2", "Friends’ trips"], ["D3", "You"],
    ]],
    ["Overlaps, trips & account", [
      ["07b", "No overlaps yet"], ["08", "Details"], ["09", "Say hi"], ["10", "Share"],
      ["11", "Invite friends"], ["12", "Friends"], ["13", "Flexible dates"], ["14", "Who can see it"],
      ["15", "Trip detail"], ["16", "Delete trip"], ["17", "Overlap alert"], ["18", "Sign in"],
      ["19", "You"], ["20", "Settings"],
    ]],
    ["v3 · Test fixes", [
      ["E1", "Oliver’s dates · can skip"], ["E2", "Sign in · after sign out"], ["E3", "Alert · alerts off"],
      ["E4", "Where · back to Welcome"], ["E5", "Sign up · back to edit trip"],
      ["F1", "Overlaps · no filter chevron"], ["F2", "You · right chevron, 1 Day"], ["F3", "Alert · real trips"],
      ["F4", "Sign up · neutral copy"],
      ["G1", "Friends · rows open a friend"], ["G2", "Friend · Oliver Cooper"], ["G3", "Remove friend?"],
      ["G4", "Home · friend visiting"], ["G5", "You · no profile photo"],
    ]],
  ];

  // The Figma frames the current screen corresponds to (v3 frames often re-draw a v1/v2 one).
  function currentFrames() {
    const s = state.screen;
    const all = computeOverlaps();
    if (s === "welcome") return ["A1"];
    if (s === "invite") return ["B1"];
    if (s === "oliverTrips") return ["B3", "E1"];
    if (s === "form") {
      if (ui.sheet === "visibility") return ["14"];
      if (state.formStep === "when" && state.draft && state.draft.whenMode === "flex") return ["13"];
      const n = STEP_NO[state.formStep];
      if (state.signedIn) return [`C${n}`];
      if (state.invitedBy && n === 1) return ["B4"];
      return n === 1 ? ["A2", "E4"] : [`A${n + 1}`];
    }
    if (s === "signup") {
      if (state.invitedBy) return ["B2", "F4"];
      return state.trips.length ? ["A5", "E5"] : ["A5"];
    }
    if (s === "homeBase") return ["A6"];
    if (s === "overlaps") {
      if (!all.length && !state.trips.length) return ["D1", "F1"];
      if (!all.length && !state.friends.length) return ["A7"];
      if (!all.length) return ["07b"];
      if (Object.values(state.expanded).some(Boolean)) return ["08"];
      return all.some((o) => o.home) ? ["C0", "G4"] : ["C0"];
    }
    if (s === "sayHi") return [ui.sheet === "share" ? "10" : "09"];
    if (s === "inviteFriends") return ["11"];
    if (s === "friends") return state.friends.length ? ["12", "G1"] : ["D2"];
    if (s === "friend") return [ui.sheet === "removeFriend" ? "G3" : "G2"];
    if (s === "tripDetail") return [ui.sheet === "deleteTrip" ? "16" : "15"];
    if (s === "alerts") return state.alerts && all.length ? ["17", "F3"] : ["E3"];
    if (s === "signin") return ["18", "E2"];
    if (s === "you") return state.mePhoto === false ? ["G5"] : state.trips.length ? ["19", "F2"] : ["D3"];
    if (s === "settings") return ["20"];
    return [];
  }

  function renderPanel() {
    const current = currentFrames();
    const scrollTop = panel.scrollTop;
    panel.innerHTML = `
      <h1>Small World</h1>
      <p class="panel-note">A working prototype of the Figma v2 flows and v3 test fixes. Tap through the phone, or jump to any frame below.</p>
      ${FRAMES.map(([group, items]) => `
        <div class="panel-group">
          <p class="overline">${group}</p>
          ${items.map(([n, label]) => `<button class="panel-link ${current.includes(n) ? "is-active" : ""}" data-jump="${n}"><span>${n}</span><span>${label}</span></button>`).join("")}
        </div>`).join("")}
      <p class="panel-note">Tips: tap an overlap’s header to expand it and its trip to say hi. Trips set to “Just sharing” or “Just me” never create overlaps.</p>
      <button class="panel-reset" data-jump="reset">Reset prototype</button>`;
    panel.scrollTop = scrollTop;
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  // A signed-in account. By default: the Copenhagen trip, all friends (as in C0 and the v1 screens).
  function seedAccount({ trips = SEED_TRIPS.slice(0, 1), friends = ALL_FRIENDS, pending = SEED_PENDING } = {}) {
    state.signedIn = true;
    state.invitedBy = null;
    state.homeCity = "Brooklyn, New York";
    state.trips = clone(trips);
    state.friends = friends.slice();
    state.pending = pending.slice();
  }
  function seedDraft(step, patch) {
    state.draft = Object.assign(newDraft(), { city: "Copenhagen, Denmark" }, patch || {});
    state.formMode = "new";
    state.formStep = step;
    state.search = state.draft.city;
    state.calMonth = "2026-06";
  }
  const DATES = { start: "2026-06-05", end: "2026-06-11" };

  function jump(key) {
    closeOverlays();
    ui.toast = null;
    clearTimeout(toastTimer);
    setPanelOpen(false);
    const firstOverlapId = "t1_f1";
    state = freshState();
    switch (key) {
      case "reset": case "A1": break;
      // A · found it on their own (signed out, no friends)
      case "A2": seedDraft("where", { city: "" }); state.search = ""; state.screen = "form"; break;
      case "A3": seedDraft("when", DATES); state.screen = "form"; break;
      case "A4": seedDraft("what", Object.assign({ purpose: "Vacation" }, DATES)); state.screen = "form"; break;
      case "A5": state.trips = clone(SEED_TRIPS.slice(0, 1)); state.screen = "signup"; break;
      case "A6": state.trips = clone(SEED_TRIPS.slice(0, 1)); state.signedIn = true; state.screen = "homeBase"; break;
      case "A7": seedAccount({ friends: [], pending: [] }); state.screen = "overlaps"; break;
      // B · invited by Oliver
      case "B1": state.invitedBy = "oliver"; state.screen = "invite"; break;
      case "B2": state.invitedBy = "oliver"; state.stack = ["invite"]; state.screen = "signup"; break;
      case "B3": state.invitedBy = "oliver"; state.signedIn = true; state.friends = ["oliver"]; state.screen = "oliverTrips"; break;
      case "B4": state.invitedBy = "oliver"; seedDraft("where", { city: "" }); state.search = ""; state.stack = ["invite"]; state.screen = "form"; break;
      // C · adding a trip after sign-in
      case "C0": seedAccount(); state.screen = "overlaps"; break;
      case "C1": seedAccount(); state.stack = ["overlaps"]; seedDraft("where", { city: "" }); state.search = ""; state.screen = "form"; break;
      case "C2": seedAccount(); state.stack = ["overlaps"]; seedDraft("when", DATES); state.screen = "form"; break;
      case "C3": seedAccount(); state.stack = ["overlaps"]; seedDraft("what", Object.assign({ purpose: "Vacation" }, DATES)); state.screen = "form"; break;
      // D · new account, no trips, no friends
      case "D1": seedAccount({ trips: [], friends: [], pending: [] }); state.screen = "overlaps"; break;
      case "D2": seedAccount({ trips: [], friends: [], pending: [] }); state.screen = "friends"; break;
      case "D3": seedAccount({ trips: [], friends: [], pending: [] }); state.screen = "you"; break;
      // Overlaps, trips & account
      case "07b": // no Emma, so her New York visit doesn't show up as a home overlap
        seedAccount({ trips: [Object.assign({}, SEED_TRIPS[0], { start: "2026-06-20", end: "2026-06-24" })], friends: ["oliver", "jessica", "leo"] });
        state.screen = "overlaps"; break;
      case "08": seedAccount(); state.expanded = { [firstOverlapId]: true }; state.screen = "overlaps"; break;
      case "09": case "10":
        seedAccount(); state.overlapId = firstOverlapId; state.stack = ["overlaps"]; state.screen = "sayHi";
        if (key === "10") ui.sheet = "share";
        break;
      case "11": seedAccount(); state.stack = ["overlaps"]; state.screen = "inviteFriends"; break;
      case "12": seedAccount(); state.screen = "friends"; break;
      case "13": seedAccount(); state.stack = ["overlaps"]; seedDraft("when", { whenMode: "flex", month: 6, length: "week" }); state.screen = "form"; break;
      case "14":
        seedAccount(); state.stack = ["overlaps"]; seedDraft("what", Object.assign({ purpose: "Vacation" }, DATES)); state.screen = "form";
        ui.sheet = "visibility"; ui.sheetCtx = "draft"; ui.sheetValue = state.draft.visibility;
        break;
      case "15": case "16":
        seedAccount({ trips: SEED_TRIPS }); state.tripId = "t1"; state.stack = ["you"]; state.screen = "tripDetail";
        if (key === "16") ui.sheet = "deleteTrip";
        break;
      // 17 / F3: Copenhagen overlaps Oliver; Emma visits Brooklyn (home) Aug 3 – 5.
      case "17": case "F3": seedAccount(); state.screen = "alerts"; break;
      case "18": state.screen = "signin"; break;
      case "19": seedAccount({ trips: SEED_TRIPS }); state.screen = "you"; break;
      case "20": seedAccount({ trips: SEED_TRIPS }); state.stack = ["you"]; state.screen = "settings"; break;
      // v3 · Test fixes
      case "E1": state.invitedBy = "oliver"; state.signedIn = true; state.friends = ["oliver"]; state.screen = "oliverTrips"; break;
      case "E2": state.screen = "signin"; break; // after sign out: nothing to go back to
      case "E3": seedAccount(); state.alerts = false; state.screen = "alerts"; break;
      case "E4": seedDraft("where", { city: "" }); state.search = ""; state.homeCity = "Brooklyn, New York"; state.screen = "form"; break;
      case "E5": state.trips = clone(SEED_TRIPS.slice(0, 1)); state.screen = "signup"; break;
      case "F1": seedAccount({ trips: [], friends: [], pending: [] }); state.screen = "overlaps"; break;
      case "F2": case "G5": {
        const dayTrip = { id: "t5", city: "Brooklyn, New York", whenMode: "dates", start: "2026-06-21", end: "2026-06-21", month: 5, length: "weekend", purpose: "Other", mood: "open", visibility: "friends" };
        seedAccount({ trips: [SEED_TRIPS[0], SEED_TRIPS[1], dayTrip] }); state.screen = "you";
        if (key === "G5") { state.myName = "Sam"; state.mePhoto = false; } // signed up without a profile photo
        break;
      }
      case "F4": state.invitedBy = "oliver"; state.stack = ["invite"]; state.screen = "signup"; break;
      case "G1": seedAccount(); state.screen = "friends"; break;
      case "G2": case "G3":
        seedAccount(); state.friendId = "oliver"; state.stack = ["friends"]; state.screen = "friend";
        if (key === "G3") ui.sheet = "removeFriend";
        break;
      case "G4": seedAccount(); state.screen = "overlaps"; break;
    }
    render();
  }

  // ---------- Events ----------
  function onAction(el) {
    const a = el.dataset.action;
    const d = state.draft;
    switch (a) {
      case "go": go(el.dataset.to); break;
      case "back": back(); break;
      case "go-home": state.filter = "all"; resetTo("overlaps"); break;
      case "new-here": state = freshState(); closeOverlays(); render(); break;
      case "exit-onboarding": {
        // Re-editing a saved trip from Sign up (E5): back returns to Sign up with the trip unchanged.
        const reEditing = state.formMode === "onboarding-edit";
        state.draft = null; state.formMode = "new";
        resetTo(reEditing ? "signup" : state.invitedBy ? "invite" : "welcome");
        break;
      }
      case "signup-back": {
        const trip = state.trips[state.trips.length - 1];
        if (trip && !state.signedIn) {
          // E5: reopen the saved trip at its last step. It stays in state.trips and is edited in place,
          // so backing out or skipping never loses it.
          state.draft = Object.assign({}, trip);
          state.formMode = "onboarding-edit";
          state.formStep = "what";
          state.search = trip.city;
          state.calMonth = (trip.start || "2026-06-01").slice(0, 7);
          resetTo("form");
        } else resetTo(state.invitedBy ? "invite" : "welcome"); // B2 → B1
        break;
      }
      case "tab": state.filter = "all"; resetTo(el.dataset.to); break;
      case "new-trip": startTrip(); break;

      // Add trip form
      case "step": state.formStep = el.dataset.step; if (el.dataset.step === "where") state.search = d.city; render(); break;
      case "clear-form": state.draft = Object.assign(newDraft(), { id: d.id }); state.formStep = "where"; state.search = ""; state.calMonth = "2026-06"; render(); break;
      case "close-form": state.draft = null; back(); break;
      case "skip-onboarding": skipOnboarding(); break;
      case "pick-city": d.city = el.dataset.city; state.search = d.city; state.formStep = "when"; render(); break;
      case "when-mode": d.whenMode = el.dataset.mode; render(); break;
      case "flex-month": d.month = Number(el.dataset.m); render(); break;
      case "flex-length": d.length = el.dataset.k; render(); break;
      case "cal-prev": case "cal-next": {
        const [y, m] = state.calMonth.split("-").map(Number);
        state.calMonth = iso(new Date(y, m - 1 + (a === "cal-next" ? 1 : -1), 1)).slice(0, 7);
        render(); break;
      }
      case "pick-day": {
        const k = el.dataset.day;
        if (!d.start || d.end) { d.start = k; d.end = null; }
        else if (k < d.start) d.start = k;
        else d.end = k;
        render(); break;
      }
      case "purpose": d.purpose = el.dataset.p; render(); break;
      case "mood": d.mood = el.dataset.k; render(); break;
      case "form-next": {
        if (state.formStep === "where") {
          if (!d.city) {
            // Next behaves like Enter: resolve the typed text to a destination.
            if (state.search.trim()) { d.city = resolveCity(state.search); state.search = d.city; }
            else { toast("Choose a destination first"); break; }
          }
          state.formStep = "when"; render();
        } else if (state.formStep === "when") {
          if (d.whenMode === "dates" && !d.start) { toast("Pick your dates first"); break; }
          if (d.whenMode === "dates" && !d.end) d.end = d.start;
          state.formStep = "what"; render();
        } else submitDraft();
        break;
      }

      // Visibility sheet
      case "open-visibility": {
        const ctx = el.dataset.ctx;
        ui.sheet = "visibility"; ui.sheetCtx = ctx;
        ui.sheetValue = ctx === "draft" ? d.visibility : ctx === "trip" ? findTrip(state.tripId).visibility : state.defaultVisibility;
        render(); break;
      }
      case "pick-visibility": ui.sheetValue = el.dataset.k; render(); break;
      case "save-visibility": {
        if (ui.sheetCtx === "draft") d.visibility = ui.sheetValue;
        else if (ui.sheetCtx === "trip") findTrip(state.tripId).visibility = ui.sheetValue;
        else state.defaultVisibility = ui.sheetValue;
        closeOverlays(); render(); break;
      }
      case "close-sheet": closeOverlays(); render(); break;

      // Auth + home base
      case "auth": signIn(el.dataset.from); break;
      case "toggle-alerts-draft": state.alertsDraft = !state.alertsDraft; render(); break;
      case "toggle-alerts": state.alerts = !state.alerts; render(); toast(state.alerts ? "Overlap alerts on" : "Overlap alerts off"); break;
      case "save-home": {
        const v = state.homeDraft.trim();
        if (!v) { toast("Add your home city"); break; }
        state.homeCity = v; state.alerts = state.alertsDraft;
        if (state.homeMode === "edit") { back(); toast("Home city saved"); } else resetTo("overlaps");
        break;
      }
      case "skip-home": resetTo("overlaps"); break;
      case "edit-home":
        state.homeMode = "edit"; state.homeDraft = state.homeCity || ""; state.alertsDraft = state.alerts; go("homeBase"); break;

      // Overlaps
      case "toggle-menu": ui.menuOpen = !ui.menuOpen; render(); break;
      case "filter": state.filter = el.dataset.who; ui.menuOpen = false; render(); break;
      case "toggle-overlap": state.expanded[el.dataset.id] = !state.expanded[el.dataset.id]; render(); break;
      case "say-hi": state.overlapId = el.dataset.id; go("sayHi"); break;
      case "open-share": ui.sheet = "share"; render(); break;
      case "shared": {
        const app = el.dataset.app;
        closeOverlays();
        setTimeout(() => toast(`Opening ${app}…`), 0);
        break; // let the link navigate
      }

      // Invite
      case "copy-link": copy(`https://${INVITE_LINK}`).then(() => { state.copied = true; render(); setTimeout(() => { state.copied = false; render(); }, 2000); }); break;
      case "share-link":
        if (navigator.share) navigator.share({ title: "Join me on Small World", url: `https://${INVITE_LINK}` }).catch(() => {});
        else copy(`https://${INVITE_LINK}`).then(() => toast("Invite link copied"));
        break;

      // Trips
      case "open-trip": state.tripId = el.dataset.id; go("tripDetail"); break;

      // Friends
      case "open-friend": state.friendId = el.dataset.who; go("friend"); break;
      case "open-remove-friend": ui.sheet = "removeFriend"; render(); break;
      case "confirm-remove-friend": {
        const who = state.friendId;
        state.friends = state.friends.filter((w) => w !== who);
        if (state.filter === who) state.filter = "all";
        state.friendId = null;
        resetTo("friends");
        toast(`${PEOPLE[who].short} removed`);
        break;
      }
      case "edit-trip": editTrip(state.tripId, el.dataset.step); break;
      case "open-delete-trip": ui.sheet = "deleteTrip"; render(); break;
      case "confirm-delete-trip":
        state.trips = state.trips.filter((t) => t.id !== state.tripId);
        back(); toast("Trip deleted"); break;

      // Account
      case "sign-out": state = Object.assign(freshState(), { screen: "signin" }); closeOverlays(); render(); break;
      case "open-delete-account": ui.sheet = "deleteAccount"; render(); break;
      case "confirm-delete-account": state = freshState(); closeOverlays(); render(); toast("Account deleted"); break;
    }
  }

  function copy(text) {
    try { return navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }

  device.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (ui.menuOpen && !e.target.closest(".menu") && !(el && el.dataset.action === "toggle-menu")) {
      ui.menuOpen = false;
      if (!el) { render(); return; }
    }
    if (!el || el.disabled) return;
    if (el.tagName !== "A") e.preventDefault();
    onAction(el);
  });
  // While an IME (Chinese/Japanese keyboards) is composing, update state but don't re-render the input.
  let composing = false;
  device.addEventListener("compositionstart", () => { composing = true; });
  device.addEventListener("compositionend", (e) => {
    composing = false;
    if (e.target.dataset.input === "search") onSearchInput(e.target);
  });
  function onSearchInput(el) {
    state.search = el.value;
    if (state.draft && el.value !== state.draft.city) state.draft.city = "";
    if (composing) save(); else render();
  }
  device.addEventListener("input", (e) => {
    const el = e.target;
    const k = el.dataset.input;
    if (k === "search") onSearchInput(el);
    else if (k === "home") { state.homeDraft = el.value; save(); }
    else if (k === "message") { state.messages[state.overlapId] = el.value; save(); }
  });
  device.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.target.dataset.input === "search" && state.search.trim()) {
      e.preventDefault();
      state.draft.city = resolveCity(state.search);
      state.search = state.draft.city;
      state.formStep = "when";
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("panel-open")) { setPanelOpen(false); return; }
    if (ui.sheet || ui.menuOpen) { closeOverlays(); render(); }
  });
  panel.addEventListener("click", (e) => {
    const el = e.target.closest("[data-jump]");
    if (el) jump(el.dataset.jump);
  });

  // Narrow screens: the side panel opens as an overlay from a floating "Frames" button.
  function setPanelOpen(open) { document.body.classList.toggle("panel-open", open); }
  document.getElementById("frames-btn").addEventListener("click", () => setPanelOpen(!document.body.classList.contains("panel-open")));
  document.getElementById("panel-backdrop").addEventListener("click", () => setPanelOpen(false));

  // Scale the 393×852 device to fit the viewport.
  const wrap = document.getElementById("device-wrap");
  function fit() {
    const panelW = window.innerWidth > 900 ? 260 + 48 + 48 : 0;
    const s = Math.min(1, (window.innerHeight - 48) / 852, (window.innerWidth - panelW - 24) / 393);
    wrap.style.width = `${393 * s}px`;
    wrap.style.height = `${852 * s}px`;
    device.style.transform = `scale(${s})`;
    device.style.transformOrigin = "top left";
  }
  window.addEventListener("resize", fit);
  fit();
  render();
})();

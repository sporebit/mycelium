# Graph Report - .  (2026-06-09)

## Corpus Check
- Large corpus: 825 files · ~691,619 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 2844 nodes · 5522 edges · 193 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 2443 · imports: 1473 · imports_from: 993 · calls: 544 · rationale_for: 32 · references: 24 · method: 13


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 825 · Candidates: 911
- Excluded: 3 untracked · 51997 ignored · 1 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `676ae66`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 162 edges
2. `Mono()` - 64 edges
3. `localDateKey()` - 34 edges
4. `Panel()` - 27 edges
5. `PATCH()` - 25 edges
6. `Task` - 25 edges
7. `userId()` - 24 edges
8. `Shell()` - 23 edges
9. `DELETE()` - 22 edges
10. `CardWidth` - 16 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `isExcel()`  [EXTRACTED]
  app/api/people/import/route.ts → app/api/finance/transactions/import/route.ts
- `POST()` --calls--> `excelToCsv()`  [EXTRACTED]
  app/api/people/import/route.ts → app/api/finance/transactions/import/route.ts
- `PATCH()` --calls--> `validIsoWeek()`  [EXTRACTED]
  app/api/workouts/[id]/route.ts → app/api/fitness/phases/[id]/route.ts
- `GET()` --calls--> `loadDetail()`  [EXTRACTED]
  app/api/workouts/[id]/route.ts → app/api/fitness/programmes/[id]/route.ts
- `POST()` --calls--> `sessionBelongsToUser()`  [EXTRACTED]
  app/api/workouts/[id]/exercises/route.ts → app/api/fitness/programmes/[id]/sessions/[sessionId]/exercises/route.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (75): animProps, args, bboxes, buildElementLifecycles(), buildTimeline(), captureSnapshots(), COMP_DIR, computeDensity() (+67 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (28): DEFAULT_TARGETS, Nutrition(), NUTRITION_TARGETS, BarcodeScanner(), FoodLibrary(), FoodSearch(), Tab, MacroBar() (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (38): blockerTone(), composeMessage(), escHtml(), fmtCurrencyShort(), fmtTimeLondon(), fmtTimeRange(), BriefingData, fetchFinanceWithDelta() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (38): buildContextBlock(), POST(), shortDate(), snippetFor(), sseEvent(), streamFromAnthropic(), cache, Entry (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (22): AnimatedNumber(), Props, Props, StatCard(), Props, UnderlinedText(), OutroScene(), Props (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (32): GET(), userId(), FinishModal(), CurrentExerciseCard(), dataShapeOf(), fmtElapsed(), formatTargetNumber(), isBodyweight() (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (34): fmtPct(), fmtPrice(), FULL_NAMES, RotatingTicker(), aggregate(), avgOf(), filterByDistance(), haversineMiles() (+26 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (22): EditableSession, ProgrammeEditor(), SLOT_LABEL, ProgrammeDetail, WorkoutCreateClient(), KIND_ICON, KIND_LABEL, SLOT_LABEL (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (35): findPendingById(), ReminderDetails, answerCallbackQuery(), botToken(), downloadFile(), editMessageText(), getFile(), GetFileResult (+27 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (23): Fitness(), AddSessionModal(), TEMPLATE_KINDS, Toast, backHrefForDate(), CalendarDayView(), fmtFullDate(), Props (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (12): Goals, Journal(), MOOD_TONE, Mono(), Panel(), SectionLabel(), ProgrammesList(), Toast (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (14): ALLOWED, ALLOWED_FIELDS, DELETE(), GET(), loadDetail(), PATCH(), PatchBody, PEOPLE_COLUMNS (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (21): EntityPicker(), Columns, TaskBoard(), BulkAction, TaskBulkBar(), formatDate(), TaskDetailPane(), DrawerMode (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (24): buildPainPoints(), ChartTooltipContent(), DotProps, ExerciseHistoryClient(), fmtDate(), fmtDateShort(), fmtNumber(), fmtUnitLabel() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (24): CaptureReview(), Operator(), fmtDate(), fmtTime(), greeting(), Session(), TopTask, OPERATOR (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (21): extractFinance(), getLatestSnapshot(), getSnapshotHistory(), DayRow, fmtDate(), RowFragment(), GET(), userId() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (8): Item, MoreList(), SECTIONS, BeforeInstallPromptEvent, InstallState, useInstallPrompt(), JournalIcon(), NavIconProps

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (25): DesignSystemGenerator, _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides() (+17 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (24): Filter, FILTERS, fmtAmount(), PurchaseRow(), PurchasesClient(), Toast, URGENCY_LABEL, URGENCY_TONE (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (26): ALLOWED_FIELDS, Body, POST(), userId(), logTaskActivity(), stringify(), TRACKED_FIELDS, fetchTaskById() (+18 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (24): GET(), PATCH(), readReview(), thisWeekContext(), userId(), GET(), readReview(), POST() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (26): FitnessCalendarPage(), parseMonth(), FitnessCalendarDayPage(), loadProgrammeSessions(), CalendarDay, CalendarPill, CalendarPillState, dowOfDateKey() (+18 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (30): buildClassifierSystemPrompt(), CaptureKind, CaptureMood, CaptureUrgency, ClassificationMention, classifyAnthropic(), classifyCapture(), classifyOpenAI() (+22 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (18): ContextPicker(), DeviceKind, scoreTaskForContext(), GET(), POST(), userId(), ContextSwitcher(), ENERGY_LABEL (+10 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (18): DropdownPosition, StatusDropdown(), ContextAction, formatDue(), iconForContextValue(), SubStats, TaskRowList(), TaskRowProps (+10 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (19): SyncStatus(), getDb(), SyncOp, body, calls, exercisePayload, sessionPayload, store (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (21): BodyMetricSource, DAY_LABELS, HistoryResponse, HistorySessionCard, Intensity, LastSession, LoggedSession, LoggedSet (+13 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (15): Habits(), Habit, HABITS, Draft, HabitsConfigModal(), GET(), userId(), cacheKeyForToday() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (17): Capture, CaptureReviewClient(), Classification, confidenceTone(), inferConfidence(), KIND_OPTIONS, PeopleApiRow, Person (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (21): FinancePulse(), SnapshotResponse, buildUserMessage(), extractSnapshot(), Breakdown, findClosestBefore(), fmtCurrency(), fmtSigned() (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (22): amexParser, AccountDescriptor, CsvBankParser, CsvParseResult, dedupHash(), normaliseTxnType(), NormalizedTxn, normalizeLines() (+14 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (22): ABBREVIATIONS, expandAbbreviations(), jaccard(), matchExerciseName(), STOPWORDS, tokens(), MatchConfidence, ParsedCardio (+14 more)

### Community 32 - "Community 32"
Cohesion: 0.08
Nodes (8): GET(), userId(), GET(), loadSessionDetail(), POST(), userId(), createServerClient(), TaskRow

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (18): Fuel(), relativeTime(), shortAddress(), StationRow(), topNCheapest(), asCol(), CARD_KEYS, CARD_REGISTRY (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (21): Classification, buildCaptureRulesBlock(), buildFitnessRulesBlock(), cache, CacheEntry, cacheKey(), fetchEnabledRules(), formatRulesBlock() (+13 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (11): TaskListView(), isSplitPaneView(), TasksClient(), Toast, ShortcutHelpModal(), ShortcutHintBar(), SHORTCUTS, CrmView (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (14): GET(), userId(), resolveExerciseNames(), ExercisePainLog, FeelRating, FEEL_TONE, PainOverview(), GET() (+6 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (22): ParsedWorkout, PendingButtonOption, PendingWorkoutRoute, VoiceRouteResult, VoiceContext, applyDecisionTree(), buildVoiceContext(), createExtraSession() (+14 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (18): GET(), userId(), Extracted, LabelScanner(), Stage, fetchFullProduct(), isLikelyBarcode(), lookupBarcode() (+10 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (18): absAmt(), AmbiguousPayment, DbCandidate, DbPayment, fetchPool(), findCandidates(), getAmbiguousPayments(), getMatchCounts() (+10 more)

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (13): AmbiguousPayment, DatePreset, fmtDate(), getDatePresets(), isoDate(), MatchCandidate, MatchCounts, SpendingClient() (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (14): FinishBody, POST(), userId(), BodyMetricsView(), Toast, UNITS, isHeavyLift(), roundTargetForDisplay() (+6 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (11): AnalysisClient(), CategoryRow, DatePreset, getPresets(), isoDate(), MonthlyRow, fmt(), Money() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (12): BudgetSection(), fmtCost(), ProjectDetail(), Props, URGENCY_TONE, CreateBody, GET(), POST() (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (7): PrivacyCtx, PrivacyProvider(), PrivacyState, usePrivacy(), FinancePageClient(), MonthlyRow, SnapshotResponse

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (9): COLOUR_PRESETS, Filter, FILTERS, ProjectsClient(), View, COLLAPSED_BY_DEFAULT, SortableStatusCard(), stuckDays() (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.15
Nodes (15): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+7 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (18): approxBezierLength(), BACKOFF_OFFSETS, Bez, buildInitialNetwork(), ccw(), clamp(), computeCumLengths(), GrowOpts (+10 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (16): DELETE(), PATCH(), userId(), VALID_UNITS, validDate(), BodyMetric, WeightUnit, DELETE() (+8 more)

### Community 49 - "Community 49"
Cohesion: 0.15
Nodes (5): ContextSwitcherGate(), FloatingCapture(), Toast, GlobalSearch(), Shell()

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (10): displayName(), Filter, initialsOf(), PeopleClient(), Mode, PersonDrawer(), RELATIONSHIPS, ReviewQueue() (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (12): ArchiveEntry, markStaleSessionsAttempted(), SessionStatus, DailyLogRow, DailyNotes, getOrCreateDailyLog(), cloneEmptySlots(), GET() (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (14): GET(), userId(), CreatePayload, GET(), POST(), userId(), CoreField, estimateBurnedKcal() (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (14): Body, GET(), userId(), ImportResult, MentionConfidence, MentionResolution, MentionSourceType, MentionWithSnippet (+6 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (7): CARDS, OverviewCard, SectionOverview(), CARDS, CARDS, CARDS, CARDS

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (8): DesignProject, FootageItem, MusicProject, SAMPLE_DESIGN, SAMPLE_FOOTAGE, SAMPLE_MUSIC, StudioClient(), StudioTab

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (10): CATEGORIES, formatDate(), haversineMiles(), Place, PlaceRow(), PlacesClient(), PlacesMap, STATUS_COLORS (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (15): checkBeatDurationConsistency(), checkBrandVisualsUsed(), checkMp4Exists(), checkPerBeatHeadlineSize(), checkPerBeatTimelineCoverage(), checkRequiredArtifacts(), checkSfxTimestampConsistency(), checkShaderTransitionsConsistency() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.17
Nodes (14): recordMention(), ALLOWED_KINDS, ALLOWED_URGENCIES, createRoutedRow(), deleteRoutedRow(), mergeClassification(), PATCH(), recordMentions() (+6 more)

### Community 59 - "Community 59"
Cohesion: 0.18
Nodes (12): ApiTransaction, baseUrl(), EVENT_CODE_MAP, fetchPage(), fetchTransactions(), getAccessToken(), TransactionSearchResponse, PayPalRawRow (+4 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (13): aiCategorise(), applyRules(), categorise(), CategoriseSummary, INTERNAL_DESCRIPTION_PATTERNS, normaliseText(), SELF_NAME_PATTERNS, TxnRow (+5 more)

### Community 61 - "Community 61"
Cohesion: 0.15
Nodes (12): Filter, FILTER_VALUES, FILTERS, fmtDuration(), fmtVolume(), HistoryClient(), SLOT_ICON, SLOT_LABEL (+4 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (12): interTight, jetbrainsMono, metadata, Ctx, INITIAL, TransitionAPI, TransitionProvider(), TransitionState (+4 more)

### Community 63 - "Community 63"
Cohesion: 0.18
Nodes (13): dueLabel(), ownerInitials(), TaskCard(), Group, TaskCategory(), EXAMPLES, TaskSmart(), PillTone (+5 more)

### Community 64 - "Community 64"
Cohesion: 0.25
Nodes (11): refreshFinanceBestEffort(), fetchFinanceSheet(), FinanceNotConfiguredError, SheetData, persistSnapshot(), GET(), isCronRequest(), notConfigured() (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (11): PushPayload, sendToUser(), SubRow, chainable, sb, subs, upsertSubscription(), POST() (+3 more)

### Community 66 - "Community 66"
Cohesion: 0.15
Nodes (10): ALL_MARKERS, BloodTestResult, getStatus(), getTrendArrow(), PANEL_ORDER, ParsedResult, RangeBar(), ResultRow() (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.19
Nodes (11): DashboardGrid(), buildHeadlineContext(), HeadlineCandidate, HeadlineContext, jsDayToProgrammeDow(), matchHeadlines(), previousNDays(), Rule (+3 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (12): FRI_PM, FRIDAY_AM, HIIT_AM, KB_EMOM_AM, MON_PM, PHIL_PROGRAMME_SEED, PHIL_PROGRAMME_SESSIONS, SeedExercise (+4 more)

### Community 69 - "Community 69"
Cohesion: 0.16
Nodes (7): buildBranch(), CanvasHub(), hexToRgb(), lerpColour(), mulberry32(), SECTIONS, Seg

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (6): CATEGORIES, CATEGORY_ORDER, ComponentCard(), formatDate(), PcBuildClient(), PcComponent

### Community 71 - "Community 71"
Cohesion: 0.14
Nodes (3): londonFmt, Reminder, RemindersClient()

### Community 72 - "Community 72"
Cohesion: 0.21
Nodes (6): TABS, SubNavRail(), SubNavTab, TABS, TABS, TABS

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (10): NavTab, TABS, TopRail(), Wordmark(), SECTION_BASE_ROUTES, SectionConfig, SECTIONS, SubPage (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.26
Nodes (11): ConvertSection(), CONVERTIBLE_KINDS, ConvertibleKind, KIND_LABELS, kindTable(), shareRawCapturesTable(), buildTargetPayload(), ConvertBody (+3 more)

### Community 75 - "Community 75"
Cohesion: 0.26
Nodes (8): aliasKey(), boundedLevenshtein(), normaliseAlias(), Supabase, Body, POST(), ResolveBody, userId()

### Community 76 - "Community 76"
Cohesion: 0.21
Nodes (9): GET(), userId(), exerciseHistorySummary(), findPRs(), modalUnit(), RawExerciseSessionRow, ExerciseHistoryEntry, ExerciseHistoryResponse (+1 more)

### Community 77 - "Community 77"
Cohesion: 0.15
Nodes (7): ItemStatus, ItemType, SAMPLE_ITEMS, STATUS_ORDER, TYPE_LABELS, WatchlistClient(), WatchlistItem

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (11): _custom_hook(), _find_matching_paren(), Finding, lint_file(), main(), Given the index of an open `(`, return the index of its matching `)`.      Skips, A lint rule: a matcher that yields hits, plus the metadata each hit gets.      A, _regex_matcher() (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.24
Nodes (7): inferExt(), POST(), userId(), generateEmbedding(), transcribeAudio(), embedAndStore(), writeCapture()

### Community 80 - "Community 80"
Cohesion: 0.22
Nodes (8): PhasesView(), Toast, ProgrammePhase, GET(), POST(), userId(), validIsoWeek(), parseIsoWeek()

### Community 81 - "Community 81"
Cohesion: 0.27
Nodes (10): AddBody, CreateBody, ensureOwned(), GET(), NUMERIC_FIELDS, pickExercisePayload(), POST(), sessionBelongsToUser() (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.22
Nodes (8): GET(), POST(), userId(), GET(), POST(), userId(), DEFAULT_GROUPS, ensureMealGroups()

### Community 83 - "Community 83"
Cohesion: 0.17
Nodes (7): MatchedRule, Rule, RulesClient(), Scope, SCOPE_LABEL, TestResult, Toast

### Community 84 - "Community 84"
Cohesion: 0.17
Nodes (4): Capture, CapturesClient(), KINDS, SOURCES

### Community 85 - "Community 85"
Cohesion: 0.18
Nodes (5): Capture, DecisionsClient(), SOURCES, SuggestCapture(), Toast

### Community 86 - "Community 86"
Cohesion: 0.21
Nodes (7): ArchiveEntry, FIELD_GRID, FIELD_LABELS, fmtDateRange(), fmtSavedRelative(), ReviewClient(), ReviewMeta

### Community 87 - "Community 87"
Cohesion: 0.23
Nodes (8): Toast, slugifyTypeKey(), SessionTypeLoggingMode, WorkoutSessionType, CreateBody, GET(), POST(), userId()

### Community 88 - "Community 88"
Cohesion: 0.29
Nodes (8): defaultFrom(), GET(), JournalEntry, JournalGroup, generateSummary(), GET(), loadEntry(), POST()

### Community 89 - "Community 89"
Cohesion: 0.21
Nodes (9): FoodSource, productToResult(), readNutrient(), searchUsda(), USDA_NUTRIENT_IDS, UsdaFood, UsdaNutrient, GET() (+1 more)

### Community 90 - "Community 90"
Cohesion: 0.33
Nodes (9): compute_band_edges(), compute_fft_bands(), decode_audio(), extract(), main(), Decode audio to mono float32 samples via ffmpeg., Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ., Compute peak magnitude in logarithmically-spaced frequency bands. (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.24
Nodes (4): callClaudeJSON(), extractJson(), Estimate, Macros

### Community 92 - "Community 92"
Cohesion: 0.25
Nodes (8): findOrCreateAccount(), persistPayPalImport(), EXCEL_EXTENSIONS, excelToCsv(), isExcel(), PARSERS, POST(), userId()

### Community 93 - "Community 93"
Cohesion: 0.20
Nodes (7): DAYS, MEAL_SLOTS, MealSlot, PlannerGrid, Recipe, RecipesClient(), SAMPLE_RECIPES

### Community 94 - "Community 94"
Cohesion: 0.20
Nodes (8): activeKey(), ENTRIES, Entry, Glossary(), NodeDef, NodeKey, NODES, OrganismDiagram()

### Community 95 - "Community 95"
Cohesion: 0.18
Nodes (9): normalizeApiTransactions(), bankLeg, conversion, financing, fundingLeg, payment, refund, rows (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.38
Nodes (8): DELETE(), ensureOwned(), NUMERIC_FIELDS, PATCH(), PatchBody, sessionBelongsToUser(), STRING_FIELDS, userId()

### Community 97 - "Community 97"
Cohesion: 0.29
Nodes (8): normaliseRegion(), PAIN_SEED_ROWS, PainSeedRow, parseSeedRows(), parseSeverity(), REGION_MAP, POST(), userId()

### Community 98 - "Community 98"
Cohesion: 0.36
Nodes (8): GET(), GoalsNotes, POST(), readGoals(), userId(), GoalItem, GoalScope, isGoalItem()

### Community 99 - "Community 99"
Cohesion: 0.22
Nodes (5): BRISTOL_LABELS, BristolType, GutEntry, GutHealthClient(), SAMPLE_ENTRIES

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (4): FORMS, Supplement, SupplementLog, SupplementsClient()

### Community 101 - "Community 101"
Cohesion: 0.22
Nodes (3): JournalClient(), MOOD_TONE, Stats

### Community 102 - "Community 102"
Cohesion: 0.22
Nodes (3): KINDS, Template, WorkoutNowClient()

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (3): DragState, fmtYmd(), TaskCalendarView()

### Community 104 - "Community 104"
Cohesion: 0.25
Nodes (4): AccountsClient(), AccountStatus, SAMPLE_ACCOUNTS, ServiceAccount

### Community 105 - "Community 105"
Cohesion: 0.33
Nodes (7): ALLOWED_SOURCES, Body, dateKey(), GET(), POST(), userId(), VALID_UNITS

### Community 106 - "Community 106"
Cohesion: 0.25
Nodes (6): DEFAULT_TYPES, EntityRulesClient(), EntityType, Rule, TYPE_DESCRIPTION, TYPE_LABEL

### Community 107 - "Community 107"
Cohesion: 0.31
Nodes (6): Calendar(), CalendarEvent, DAY_LABELS, fmtTime(), fmtTimeRange(), ymd()

### Community 108 - "Community 108"
Cohesion: 0.22
Nodes (6): ProgrammeSession, Props, SessionSwapDropdown(), SLOT_SHORT, TemplateSlotLike, DAY_SHORT

### Community 109 - "Community 109"
Cohesion: 0.28
Nodes (8): classifyPayPalRows(), detectPayPal(), parsePayPalAmount(), parsePayPalCsv(), PAYPAL_ACCOUNT, PayPalImportResult, PayPalPaymentRow, PayPalSummary

### Community 110 - "Community 110"
Cohesion: 0.42
Nodes (8): body_metrics, workout_programme_exercises, workout_programme_phases, workout_programme_sessions, workout_programmes, workout_session_exercises, workout_sessions, workout_sets

### Community 111 - "Community 111"
Cohesion: 0.32
Nodes (6): GET(), ImportPayload, MetricEntry, POST(), userId(), WorkoutEntry

### Community 112 - "Community 112"
Cohesion: 0.29
Nodes (4): BloodMarker, BloodTestsClient(), MarkerStatus, SAMPLE_MARKERS

### Community 113 - "Community 113"
Cohesion: 0.32
Nodes (3): avatarColor(), PersonDetail(), SOURCE_ICON

### Community 114 - "Community 114"
Cohesion: 0.32
Nodes (6): KeyBlockers(), Pill(), pillLabel(), Response, tone(), BlockerRow

### Community 115 - "Community 115"
Cohesion: 0.25
Nodes (5): OUT, svg180, svg192, svg512, svgMask

### Community 116 - "Community 116"
Cohesion: 0.61
Nodes (7): assert(), main(), testAmex(), testAutoDetect(), testHalifax(), testPayPal(), testRevolut()

### Community 117 - "Community 117"
Cohesion: 0.38
Nodes (3): signToken(), POST(), timingSafeEqual()

### Community 118 - "Community 118"
Cohesion: 0.43
Nodes (5): CreatePayload, GET(), nextDue(), POST(), userId()

### Community 119 - "Community 119"
Cohesion: 0.38
Nodes (5): MOBILITY_SEED, MobilitySeedRow, ExerciseDataShape, POST(), userId()

### Community 120 - "Community 120"
Cohesion: 0.33
Nodes (5): DateSelector(), DOW_LABEL, fmtLongDate(), WeekDay, WeekSummary

### Community 121 - "Community 121"
Cohesion: 0.43
Nodes (6): config, isPublic(), middleware(), PUBLIC_PREFIXES, timingSafeEqual(), verifyHmac()

### Community 122 - "Community 122"
Cohesion: 0.33
Nodes (6): audit_log, daily_logs, entities, memory_chunks, raw_captures, tasks

### Community 123 - "Community 123"
Cohesion: 0.60
Nodes (5): DELETE(), ensureOwned(), PATCH(), PatchBody, userId()

### Community 124 - "Community 124"
Cohesion: 0.47
Nodes (5): GET(), PATCH(), PatchBody, TYPES, userId()

### Community 125 - "Community 125"
Cohesion: 0.60
Nodes (5): GET(), jsDayToProgrammeDow(), mondayOf(), userId(), ymd()

### Community 126 - "Community 126"
Cohesion: 0.33
Nodes (3): PostBody, ResultRow, SessionRow

### Community 127 - "Community 127"
Cohesion: 0.53
Nodes (5): coerce(), Extracted, extractJsonBlock(), POST(), safeNum()

### Community 128 - "Community 128"
Cohesion: 0.47
Nodes (4): POST(), userId(), migrateFromEntities(), MigrationStats

### Community 129 - "Community 129"
Cohesion: 0.53
Nodes (5): CreatePayload, extractCoordsFromGoogleMaps(), GET(), POST(), userId()

### Community 130 - "Community 130"
Cohesion: 0.53
Nodes (5): CreatePayload, GET(), londonDayStart(), POST(), userId()

### Community 131 - "Community 131"
Cohesion: 0.60
Nodes (5): ALLOWED, DELETE(), ensureOwned(), PATCH(), userId()

### Community 132 - "Community 132"
Cohesion: 0.60
Nodes (3): AsyncMetadataDriven(), calculateMetadata(), Props

### Community 133 - "Community 133"
Cohesion: 0.60
Nodes (3): BadComposition(), calculateMetadata(), useFadeMixed()

### Community 134 - "Community 134"
Cohesion: 0.70
Nodes (3): MyComposition(), pick(), TitleCard()

### Community 135 - "Community 135"
Cohesion: 0.60
Nodes (4): ensureOwned(), POST(), userId(), PersonAlias

### Community 136 - "Community 136"
Cohesion: 0.80
Nodes (4): DELETE(), PATCH(), userId(), userOwnsProgramme()

### Community 137 - "Community 137"
Cohesion: 0.60
Nodes (4): Programme, GET(), POST(), userId()

### Community 138 - "Community 138"
Cohesion: 0.60
Nodes (3): Body, POST(), userId()

### Community 139 - "Community 139"
Cohesion: 0.60
Nodes (4): CreatePayload, GET(), POST(), userId()

### Community 140 - "Community 140"
Cohesion: 0.60
Nodes (4): CreateBody, GET(), POST(), userId()

### Community 141 - "Community 141"
Cohesion: 0.50
Nodes (2): FitnessSubNav(), TABS

### Community 142 - "Community 142"
Cohesion: 0.50
Nodes (2): WorkoutDetailClient(), WorkoutEditor()

### Community 143 - "Community 143"
Cohesion: 0.60
Nodes (4): computeNext(), fmtHHMM(), SunData, SunWidget()

### Community 144 - "Community 144"
Cohesion: 0.50
Nodes (4): ContextRow, STOPWORDS, suggestContext(), tokens()

### Community 145 - "Community 145"
Cohesion: 0.50
Nodes (4): EXCLUSIONS, extractNameMentions(), isSentenceStart(), RegexExtraction

### Community 146 - "Community 146"
Cohesion: 0.40
Nodes (4): auth, drive, { google }, normalisedKey

### Community 147 - "Community 147"
Cohesion: 0.67
Nodes (2): LambdaConfigured(), renderViaLambda()

### Community 148 - "Community 148"
Cohesion: 0.67
Nodes (2): handle, WarningsOnly()

### Community 149 - "Community 149"
Cohesion: 0.83
Nodes (2): CustomHookDriven(), useFadeIn()

### Community 150 - "Community 150"
Cohesion: 0.67
Nodes (2): Item, MixedBlockers()

### Community 151 - "Community 151"
Cohesion: 0.83
Nodes (3): GET(), POST(), userId()

### Community 152 - "Community 152"
Cohesion: 0.83
Nodes (3): GET(), POST(), userId()

### Community 153 - "Community 153"
Cohesion: 0.67
Nodes (3): extractJsonBlock(), KNOWN_MARKERS, POST()

### Community 154 - "Community 154"
Cohesion: 0.67
Nodes (3): exercise_baselines, exercise_pain_logs, workout_session_exercises

### Community 155 - "Community 155"
Cohesion: 0.83
Nodes (3): people, people_aliases, people_mentions

### Community 156 - "Community 156"
Cohesion: 0.83
Nodes (3): task_activity, task_comments, tasks

### Community 157 - "Community 157"
Cohesion: 0.83
Nodes (3): foods, meal_groups, nutrition_logs

### Community 158 - "Community 158"
Cohesion: 0.67
Nodes (3): entity_review_rules, pending_entities, raw_captures

### Community 159 - "Community 159"
Cohesion: 0.83
Nodes (3): blood_test_markers, blood_test_results, blood_test_sessions

### Community 160 - "Community 160"
Cohesion: 0.67
Nodes (1): StateDriven()

### Community 161 - "Community 161"
Cohesion: 0.67
Nodes (1): SideEffectDriven()

### Community 162 - "Community 162"
Cohesion: 0.67
Nodes (1): MuiDriven()

### Community 163 - "Community 163"
Cohesion: 1.00
Nodes (2): GET(), userId()

### Community 164 - "Community 164"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 165 - "Community 165"
Cohesion: 1.00
Nodes (2): GET(), userId()

### Community 166 - "Community 166"
Cohesion: 1.00
Nodes (2): DELETE(), userId()

### Community 167 - "Community 167"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 168 - "Community 168"
Cohesion: 1.00
Nodes (2): DELETE(), userId()

### Community 169 - "Community 169"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 171 - "Community 171"
Cohesion: 0.67
Nodes (1): serwist

### Community 172 - "Community 172"
Cohesion: 0.67
Nodes (2): format_output(), Format results for Claude consumption (token-optimized)

### Community 173 - "Community 173"
Cohesion: 0.67
Nodes (1): Format

### Community 174 - "Community 174"
Cohesion: 1.00
Nodes (2): purchases, raw_captures

### Community 175 - "Community 175"
Cohesion: 1.00
Nodes (2): workout_exercises, workouts

### Community 176 - "Community 176"
Cohesion: 1.00
Nodes (2): bank_accounts, transactions

### Community 177 - "Community 177"
Cohesion: 1.00
Nodes (2): paypal_payments, transactions

### Community 178 - "Community 178"
Cohesion: 1.00
Nodes (2): auth.users, push_subscriptions

### Community 179 - "Community 179"
Cohesion: 1.00
Nodes (2): supplement_logs, supplements

### Community 180 - "Community 180"
Cohesion: 0.67
Nodes (2): health_metrics, health_workouts

### Community 182 - "Community 182"
Cohesion: 0.67
Nodes (2): nextConfig, withSerwist

### Community 186 - "Community 186"
Cohesion: 1.00
Nodes (1): eslintConfig

### Community 189 - "Community 189"
Cohesion: 1.00
Nodes (1): pending_workout_routes

### Community 190 - "Community 190"
Cohesion: 1.00
Nodes (1): workout_session_types

### Community 191 - "Community 191"
Cohesion: 1.00
Nodes (1): dashboard_layouts

### Community 192 - "Community 192"
Cohesion: 1.00
Nodes (1): projects

### Community 193 - "Community 193"
Cohesion: 1.00
Nodes (1): routing_rules

### Community 194 - "Community 194"
Cohesion: 1.00
Nodes (1): context_options

### Community 195 - "Community 195"
Cohesion: 1.00
Nodes (1): pc_components

### Community 196 - "Community 196"
Cohesion: 1.00
Nodes (1): places

### Community 197 - "Community 197"
Cohesion: 1.00
Nodes (1): reminders

### Community 198 - "Community 198"
Cohesion: 1.00
Nodes (1): exercise_aliases

### Community 200 - "Community 200"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **552 isolated node(s):** `Decode audio to mono float32 samples via ffmpeg.`, `Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ.`, `Compute peak magnitude in logarithmically-spaced frequency bands.`, `Extract per-frame audio data.`, `A lint rule: a matcher that yields hits, plus the metadata each hit gets.      A` (+547 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 141`** (2 nodes): `FitnessSubNav()`, `TABS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 142`** (2 nodes): `WorkoutDetailClient()`, `WorkoutEditor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 147`** (2 nodes): `LambdaConfigured()`, `renderViaLambda()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (2 nodes): `handle`, `WarningsOnly()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (2 nodes): `CustomHookDriven()`, `useFadeIn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 150`** (2 nodes): `Item`, `MixedBlockers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 160`** (1 nodes): `StateDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (1 nodes): `SideEffectDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 162`** (1 nodes): `MuiDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 163`** (2 nodes): `GET()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 164`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (2 nodes): `GET()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 166`** (2 nodes): `DELETE()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 167`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 168`** (2 nodes): `DELETE()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (1 nodes): `serwist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (2 nodes): `format_output()`, `Format results for Claude consumption (token-optimized)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (1 nodes): `Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (2 nodes): `purchases`, `raw_captures`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (2 nodes): `workout_exercises`, `workouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (2 nodes): `bank_accounts`, `transactions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (2 nodes): `paypal_payments`, `transactions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (2 nodes): `auth.users`, `push_subscriptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (2 nodes): `supplement_logs`, `supplements`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (2 nodes): `health_metrics`, `health_workouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (2 nodes): `nextConfig`, `withSerwist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (1 nodes): `eslintConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (1 nodes): `pending_workout_routes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (1 nodes): `workout_session_types`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (1 nodes): `dashboard_layouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (1 nodes): `projects`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (1 nodes): `routing_rules`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `context_options`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `pc_components`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `places`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `reminders`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (1 nodes): `exercise_aliases`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `Community 32` to `Community 3`, `Community 2`, `Community 48`, `Community 105`, `Community 58`, `Community 11`, `Community 23`, `Community 74`, `Community 118`, `Community 51`, `Community 33`, `Community 151`, `Community 124`, `Community 39`, `Community 75`, `Community 59`, `Community 64`, `Community 60`, `Community 92`, `Community 163`, `Community 36`, `Community 5`, `Community 152`, `Community 76`, `Community 26`, `Community 37`, `Community 80`, `Community 96`, `Community 81`, `Community 136`, `Community 137`, `Community 119`, `Community 97`, `Community 68`, `Community 87`, `Community 164`, `Community 41`, `Community 138`, `Community 9`, `Community 125`, `Community 98`, `Community 27`, `Community 111`, `Community 126`, `Community 88`, `Community 52`, `Community 38`, `Community 82`, `Community 89`, `Community 15`, `Community 139`, `Community 165`, `Community 123`, `Community 135`, `Community 53`, `Community 128`, `Community 140`, `Community 129`, `Community 43`, `Community 18`, `Community 65`, `Community 20`, `Community 34`, `Community 166`, `Community 167`, `Community 130`, `Community 168`, `Community 169`, `Community 19`, `Community 8`, `Community 131`, `Community 7`, `Community 10`, `Community 21`, `Community 67`, `Community 30`, `Community 79`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `Mono()` connect `Community 10` to `Community 28`, `Community 84`, `Community 85`, `Community 50`, `Community 113`, `Community 43`, `Community 45`, `Community 18`, `Community 63`, `Community 24`, `Community 107`, `Community 29`, `Community 9`, `Community 33`, `Community 94`, `Community 27`, `Community 114`, `Community 23`, `Community 1`, `Community 14`, `Community 42`, `Community 44`, `Community 40`, `Community 41`, `Community 21`, `Community 13`, `Community 61`, `Community 5`, `Community 80`, `Community 7`, `Community 15`, `Community 36`, `Community 100`, `Community 101`, `Community 70`, `Community 56`, `Community 86`, `Community 3`, `Community 83`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `localDateKey()` connect `Community 15` to `Community 2`, `Community 105`, `Community 58`, `Community 51`, `Community 26`, `Community 6`, `Community 27`, `Community 88`, `Community 21`, `Community 35`, `Community 29`, `Community 1`, `Community 41`, `Community 5`, `Community 9`, `Community 102`, `Community 101`, `Community 67`, `Community 37`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `Decode audio to mono float32 samples via ffmpeg.`, `Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ.`, `Compute peak magnitude in logarithmically-spaced frequency bands.` to the rest of the system?**
  _552 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05740740740740741 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06370543541788427 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06015037593984962 - nodes in this community are weakly interconnected._
# Graph Report - .  (2026-07-19)

## Corpus Check
- Large corpus: 1031 files · ~1,231,879 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3734 nodes · 6920 edges · 264 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 3182 · imports: 1750 · imports_from: 1220 · calls: 676 · references: 36 · rationale_for: 32 · method: 14 · re_exports: 10


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 1031 · Candidates: 2076
- Excluded: 11 untracked · 53415 ignored · 4 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `6f4689b`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `createServerClient()` - 238 edges
2. `Mono()` - 95 edges
3. `PATCH()` - 38 edges
4. `localDateKey()` - 38 edges
5. `DELETE()` - 37 edges
6. `Panel()` - 32 edges
7. `Shell()` - 26 edges
8. `userId()` - 25 edges
9. `Task` - 25 edges
10. `CardWidth` - 18 edges

## Surprising Connections (you probably didn't know these)
- `PATCH()` --calls--> `rebuildTaskMentions()`  [EXTRACTED]
  app/api/workouts/[id]/route.ts → app/api/tasks/[id]/route.ts
- `POST()` --calls--> `isExcel()`  [EXTRACTED]
  app/api/people/import/route.ts → app/api/finance/transactions/import/route.ts
- `POST()` --calls--> `excelToCsv()`  [EXTRACTED]
  app/api/people/import/route.ts → app/api/finance/transactions/import/route.ts
- `GET()` --calls--> `slugify()`  [EXTRACTED]
  app/api/workouts/[id]/exercises/route.ts → app/api/fitness/exercises/route.ts
- `PATCH()` --calls--> `validIsoWeek()`  [EXTRACTED]
  app/api/workouts/[id]/route.ts → app/api/fitness/phases/[id]/route.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (75): animProps, args, bboxes, buildElementLifecycles(), buildTimeline(), captureSnapshots(), COMP_DIR, computeDensity() (+67 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (35): ALLOWED, DELETE(), ensureOwned(), PATCH(), userId(), EditableSession, ProgrammeEditor(), SLOT_LABEL (+27 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (29): Mono(), Counts, DateRange, Format, SECTIONS, CATEGORIES, CATEGORY_COLOURS, Inspiration (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (39): buildContextBlock(), POST(), shortDate(), snippetFor(), sseEvent(), streamFromAnthropic(), GlobalSearch(), cache (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (40): ALLOWED_FIELDS, Body, POST(), userId(), DropdownPosition, StatusDropdown(), BulkAction, TaskBulkBar() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (37): BinConfig, loadBinConfig(), loadGardenSeasons(), BinType, Collection, collectionLabel(), GardenSeason, getCollectionType() (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (22): AnimatedNumber(), Props, Props, StatCard(), Props, UnderlinedText(), OutroScene(), Props (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (37): GET(), userId(), buildPainPoints(), ChartTooltipContent(), DotProps, ExerciseHistoryClient(), fmtDate(), fmtDateShort() (+29 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (14): removeGoogleEvent(), ALLOWED, ALLOWED_FIELDS, Ctx, DELETE(), GET(), loadDetail(), PATCH() (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (8): GET(), userId(), POST(), GET(), GET(), TABLES, createServerClient(), POST()

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (30): AddBody, CreateBody, ensureOwned(), ExerciseListItem, GET(), NUMERIC_FIELDS, pickExercisePayload(), POST() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (34): fmtPct(), fmtPrice(), FULL_NAMES, RotatingTicker(), aggregate(), avgOf(), filterByDistance(), haversineMiles() (+26 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (21): FinishModal(), CurrentExerciseCard(), dataShapeOf(), fmtElapsed(), formatTargetNumber(), isBodyweight(), LogClient(), showsWeightColumn() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (31): ABBREVIATIONS, expandAbbreviations(), jaccard(), matchExerciseName(), STOPWORDS, tokens(), BodyMetricSource, DAY_LABELS (+23 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (29): amazonUrl(), daysAgo(), Episode, justWatchUrl(), ListenLinks(), MediaClient(), OwnedFilter, ReadLinks() (+21 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (21): FinancePulse(), SnapshotResponse, FinancePageClient(), MonthlyRow, SnapshotResponse, Breakdown, findClosestBefore(), fmtCurrency() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (16): Panel(), SectionLabel(), ProgrammesList(), Toast, DayRow, fmtDate(), RowFragment(), Integration (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (34): AccountDetails, buildClassifierSystemPrompt(), CaptureKind, CaptureMood, CaptureUrgency, ClassificationMention, classifyAnthropic(), classifyCapture() (+26 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (26): Filter, FILTERS, fmtAmount(), PurchaseRow(), PurchasesClient(), Toast, URGENCY_LABEL, URGENCY_TONE (+18 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (8): Item, MoreList(), SECTIONS, BeforeInstallPromptEvent, InstallState, useInstallPrompt(), JournalIcon(), NavIconProps

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (25): DesignSystemGenerator, _detect_page_type(), format_ascii_box(), format_markdown(), format_master_md(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides() (+17 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (19): ApiErrorToast(), Button(), ButtonProps, Size, Variant, Label(), Option, SegmentedControl() (+11 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (22): ArchiveEntry, PhasesView(), Toast, ProgrammePhase, GET(), POST(), userId(), validIsoWeek() (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (18): ContextPicker(), DeviceKind, scoreTaskForContext(), GET(), POST(), userId(), ContextSwitcher(), ENERGY_LABEL (+10 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (19): GET(), SLOT_LABELS, SLOT_ORDER, userId(), GET(), userId(), computeStreak(), DayCache (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (22): CalendarPage(), CATEGORIES, Drop, DROP_TYPES, DropCard(), EMPTY_MODAL, formatDate(), getWeekDays() (+14 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (19): SyncStatus(), getDb(), SyncOp, body, calls, exercisePayload, sessionPayload, store (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (18): Capture, CaptureReviewClient(), Classification, confidenceTone(), inferConfidence(), KIND_OPTIONS, PeopleApiRow, Person (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (22): Artist, ArtistCount, buildDayData(), buildHourData(), CountsPeriod, Limit, msToMin(), NowPlaying (+14 more)

### Community 29 - "Community 29"
Cohesion: 0.11
Nodes (25): detectShoppingListItem(), ReminderDetails, decodeRoute(), encodeRoute(), ROUTE_CODE, ROUTE_FROM_CODE, RoutedTo, buildPendingKeyboard() (+17 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (12): SubNavRail(), SubNavTab, DropsSubNav(), TABS, FinanceSubNav(), TABS, HealthSubNav(), TABS (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (14): DraggableCard, DraggableCardGrid(), OverviewCard, SectionOverview(), CARDS, CARDS, fetchHealthSummary(), HealthOverviewPage() (+6 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (14): Fitness(), AddSessionModal(), TEMPLATE_KINDS, Toast, KIND_VISUALS, KindVisual, SLOT_ICON, SLOT_LABEL (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (22): amexParser, AccountDescriptor, CsvBankParser, CsvParseResult, dedupHash(), normaliseTxnType(), NormalizedTxn, normalizeLines() (+14 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (18): GET(), userId(), GET(), userId(), exerciseHistorySummary(), findPRs(), modalUnit(), RawExerciseSessionRow (+10 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (17): CaptureReview(), Journal(), MOOD_TONE, ALL_SIZES, Breakpoint, buildDefaults(), CARD_COMPONENTS, CardSize (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.11
Nodes (18): Columns, TaskBoard(), dueLabel(), fmtScheduled(), ownerInitials(), TaskCard(), Group, TaskCategory() (+10 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (19): FinishBody, POST(), userId(), BodyMetricsView(), Range, RANGE_DAYS, RANGES, Toast (+11 more)

### Community 38 - "Community 38"
Cohesion: 0.19
Nodes (19): GET(), PATCH(), readReview(), thisWeekContext(), userId(), GET(), readReview(), DailyLogRow (+11 more)

### Community 39 - "Community 39"
Cohesion: 0.10
Nodes (12): TaskListView(), isSplitPaneView(), TasksClient(), Toast, ShortcutHelpModal(), ShortcutHintBar(), SHORTCUTS, CrmView (+4 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (15): fetchFinanceWithDelta(), fetchTopBlockers(), fetchTopTasks(), fetchYesterdayHabits(), gatherBriefingData(), todayEventsFromCal(), fetchWeather(), Weather (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (21): Classification, buildCaptureRulesBlock(), buildFitnessRulesBlock(), cache, CacheEntry, cacheKey(), fetchEnabledRules(), formatRulesBlock() (+13 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (19): ApiResponse, callClaude(), ContentBlock, GET(), getDaBoiContext(), POST(), userId(), AGENT_SYSTEM_PROMPTS (+11 more)

### Community 43 - "Community 43"
Cohesion: 0.13
Nodes (14): Goals, asCol(), CARD_KEYS, CARD_REGISTRY, CardCol, CardConfig, CardLayoutRow, CardWidth (+6 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (18): absAmt(), AmbiguousPayment, DbCandidate, DbPayment, fetchPool(), findCandidates(), getAmbiguousPayments(), getMatchCounts() (+10 more)

### Community 45 - "Community 45"
Cohesion: 0.14
Nodes (13): Habit, HABITS, Draft, HabitsConfigModal(), GET(), userId(), cacheKeyForToday(), DayEntry (+5 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (13): AmbiguousPayment, DatePreset, fmtDate(), getDatePresets(), isoDate(), MatchCandidate, MatchCounts, SpendingClient() (+5 more)

### Community 47 - "Community 47"
Cohesion: 0.12
Nodes (13): DailyLogResponse, Habits(), HabitsConfigResponse, DailyData, DailyItem, DailyLog, Slot, Supplements() (+5 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (18): blockerTone(), composeMessage(), escHtml(), fmtCurrencyShort(), fmtTimeLondon(), fmtTimeRange(), BriefingData, buildContext() (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (9): ContextSwitcherGate(), FAB_ROUTES, FloatingCapture(), Toast, Shell(), FitnessSubNav(), TABS, JournalClient() (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.09
Nodes (4): DEFAULT_SOURCE_CONFIG, Settings, SourceConfig, Stats

### Community 51 - "Community 51"
Cohesion: 0.11
Nodes (15): Account, AccountCard(), AccountsClient(), CATEGORIES, daysUntil(), DraftAccount, EMPTY_ACCOUNT, faviconUrl() (+7 more)

### Community 52 - "Community 52"
Cohesion: 0.12
Nodes (10): Agent, AgentChat(), Message, PendingTool, Toast, TOOL_LABELS, toolSummary(), TranscriptEntry (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (12): inferExt(), POST(), userId(), ParsedWeight, parseWeight(), generateEmbedding(), transcribeAudio(), embedAndStore() (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (13): BudgetSection(), fmtCost(), ProjectDetail(), Props, URGENCY_TONE, CreateBody, GET(), POST() (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.16
Nodes (7): buildAuthUrl(), credentials(), exchangeCode(), getStoredToken(), getValidAccessToken(), refreshAccessToken(), spotifyFetch()

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (12): DailyChecklist(), DailyData, DailyItem, DailyLog, DailySlot, fmtDate(), todayKey(), FORMS (+4 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (10): displayName(), Filter, initialsOf(), PeopleClient(), Mode, PersonDrawer(), RELATIONSHIPS, ReviewQueue() (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (12): Ctx, ShoppingItem, answerCallbackQuery(), botToken(), downloadFile(), editMessageText(), getFile(), GetFileResult (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (14): Filter, FILTER_VALUES, FILTERS, fmtDuration(), fmtVolume(), HistoryClient(), SLOT_ICON, SLOT_LABEL (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (14): CATEGORIES, CATEGORY_COLOURS, CATEGORY_LABELS, CategoryFilter, currentValue(), Draft, EMPTY_DRAFT, HoldingCard() (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.12
Nodes (5): SubNav(), TABS, londonFmt, Reminder, RemindersClient()

### Community 62 - "Community 62"
Cohesion: 0.12
Nodes (9): COLOUR_PRESETS, Filter, FILTERS, ProjectsClient(), View, COLLAPSED_BY_DEFAULT, SortableStatusCard(), stuckDays() (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (15): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+7 more)

### Community 64 - "Community 64"
Cohesion: 0.16
Nodes (18): approxBezierLength(), BACKOFF_OFFSETS, Bez, buildInitialNetwork(), ccw(), clamp(), computeCumLengths(), GrowOpts (+10 more)

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (9): BarcodeScanner(), FoodSearch(), Tab, Extracted, LabelScanner(), Stage, ManualFoodEntry(), ScanPrefill (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.17
Nodes (19): PendingButtonOption, VoiceRouteResult, VoiceContext, applyDecisionTree(), buildVoiceContext(), createExtraSession(), DecisionOpts, ensureSessionExercise() (+11 more)

### Community 67 - "Community 67"
Cohesion: 0.16
Nodes (15): ensureOwned(), POST(), userId(), Body, ImportResult, MentionConfidence, MentionResolution, MentionSourceType (+7 more)

### Community 68 - "Community 68"
Cohesion: 0.16
Nodes (16): DELETE(), PATCH(), userId(), VALID_UNITS, validDate(), BodyMetric, WeightUnit, DELETE() (+8 more)

### Community 69 - "Community 69"
Cohesion: 0.16
Nodes (14): SessionKind, Slot, TemplateExercise, TemplateSession, Body, POST(), userId(), CreateBody (+6 more)

### Community 70 - "Community 70"
Cohesion: 0.16
Nodes (10): MOOD_TONE, Stats, defaultFrom(), GET(), JournalEntry, JournalGroup, generateSummary(), GET() (+2 more)

### Community 71 - "Community 71"
Cohesion: 0.11
Nodes (10): Ad, PLATFORM_COLOURS, PLATFORM_OPTIONS, STATUS_COLOURS, STATUS_OPTIONS, Step, STEP_STATUS_CYCLE, STEP_STATUS_ICONS (+2 more)

### Community 72 - "Community 72"
Cohesion: 0.17
Nodes (12): ApiTransaction, baseUrl(), EVENT_CODE_MAP, fetchPage(), fetchTransactions(), getAccessToken(), TransactionSearchResponse, PayPalRawRow (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.22
Nodes (13): refreshFinanceBestEffort(), buildUserMessage(), extractSnapshot(), fetchFinanceSheet(), FinanceNotConfiguredError, SheetData, persistSnapshot(), GET() (+5 more)

### Community 74 - "Community 74"
Cohesion: 0.16
Nodes (14): GET(), userId(), CreatePayload, GET(), POST(), userId(), CoreField, estimateBurnedKcal() (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.17
Nodes (12): ServingPicker(), FoodSearchResult, FoodSource, Serving, productToResult(), readNutrient(), searchUsda(), USDA_NUTRIENT_IDS (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (8): DesignProject, FootageItem, MusicProject, SAMPLE_DESIGN, SAMPLE_FOOTAGE, SAMPLE_MUSIC, StudioClient(), StudioTab

### Community 77 - "Community 77"
Cohesion: 0.14
Nodes (13): fraunces, interTight, jetbrainsMono, metadata, Ctx, INITIAL, TransitionAPI, TransitionProvider() (+5 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (10): CATEGORIES, formatDate(), haversineMiles(), Place, PlaceRow(), PlacesClient(), PlacesMap, STATUS_COLORS (+2 more)

### Community 79 - "Community 79"
Cohesion: 0.33
Nodes (15): checkBeatDurationConsistency(), checkBrandVisualsUsed(), checkMp4Exists(), checkPerBeatHeadlineSize(), checkPerBeatTimelineCoverage(), checkRequiredArtifacts(), checkSfxTimestampConsistency(), checkShaderTransitionsConsistency() (+7 more)

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (13): aiCategorise(), applyRules(), categorise(), CategoriseSummary, INTERNAL_DESCRIPTION_PATTERNS, normaliseText(), SELF_NAME_PATTERNS, TxnRow (+5 more)

### Community 81 - "Community 81"
Cohesion: 0.19
Nodes (11): CalendarData, CalendarEvent, Feed, fetchBirthdays(), fetchDirectDebits(), fetchEvents(), fetchScheduledTasks(), generatePaydays() (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.23
Nodes (14): GET(), userId(), fetchFullProduct(), isLikelyBarcode(), lookupBarcode(), num(), OffNutriments, OffProduct (+6 more)

### Community 83 - "Community 83"
Cohesion: 0.18
Nodes (11): PushPayload, sendToUser(), SubRow, chainable, sb, subs, upsertSubscription(), POST() (+3 more)

### Community 84 - "Community 84"
Cohesion: 0.15
Nodes (10): ALL_MARKERS, BloodTestResult, getStatus(), getTrendArrow(), PANEL_ORDER, ParsedResult, RangeBar(), ResultRow() (+2 more)

### Community 85 - "Community 85"
Cohesion: 0.13
Nodes (6): Capture, CapturesClient(), DEFAULT_SOURCE_CONFIG, KINDS, SourceConfig, SOURCES

### Community 86 - "Community 86"
Cohesion: 0.19
Nodes (11): DashboardGrid(), buildHeadlineContext(), HeadlineCandidate, HeadlineContext, jsDayToProgrammeDow(), matchHeadlines(), previousNDays(), Rule (+3 more)

### Community 87 - "Community 87"
Cohesion: 0.17
Nodes (11): ABBREV, NavTab, TABS, TopRail(), Wordmark(), SECTION_BASE_ROUTES, SectionConfig, SECTIONS (+3 more)

### Community 88 - "Community 88"
Cohesion: 0.18
Nodes (8): ExercisePainLog, FEEL_TONE, PainOverview(), Body, GET(), POST(), userId(), VALID_RATINGS

### Community 89 - "Community 89"
Cohesion: 0.14
Nodes (12): FRI_PM, FRIDAY_AM, HIIT_AM, KB_EMOM_AM, MON_PM, PHIL_PROGRAMME_SEED, PHIL_PROGRAMME_SESSIONS, SeedExercise (+4 more)

### Community 90 - "Community 90"
Cohesion: 0.21
Nodes (13): FitnessCalendarPage(), parseMonth(), CalendarPillState, dowOfDateKey(), fetchMonthCalendar(), fetchSetCounts(), isoWeekOfDateKey(), jsDayToProgrammeDow() (+5 more)

### Community 91 - "Community 91"
Cohesion: 0.16
Nodes (7): buildBranch(), CanvasHub(), hexToRgb(), lerpColour(), mulberry32(), SECTIONS, Seg

### Community 92 - "Community 92"
Cohesion: 0.15
Nodes (6): CATEGORIES, CATEGORY_ORDER, ComponentCard(), formatDate(), PcBuildClient(), PcComponent

### Community 93 - "Community 93"
Cohesion: 0.16
Nodes (6): AnalysisClient(), CategoryRow, DatePreset, getPresets(), isoDate(), MonthlyRow

### Community 94 - "Community 94"
Cohesion: 0.26
Nodes (11): ConvertSection(), CONVERTIBLE_KINDS, ConvertibleKind, KIND_LABELS, kindTable(), shareRawCapturesTable(), buildTargetPayload(), ConvertBody (+3 more)

### Community 95 - "Community 95"
Cohesion: 0.21
Nodes (9): EntityPicker(), DrawerMode, formatCreatedAt(), scheduledFromUtc(), TaskDrawer(), GET(), POST(), userId() (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.26
Nodes (8): aliasKey(), boundedLevenshtein(), normaliseAlias(), Supabase, Body, POST(), ResolveBody, userId()

### Community 97 - "Community 97"
Cohesion: 0.15
Nodes (7): ItemStatus, ItemType, SAMPLE_ITEMS, STATUS_ORDER, TYPE_LABELS, WatchlistClient(), WatchlistItem

### Community 98 - "Community 98"
Cohesion: 0.20
Nodes (10): FitnessCalendarDayPage(), loadProgrammeSessions(), CalendarPill, fetchDayCalendar(), backHrefForDate(), CalendarDayView(), fmtFullDate(), Props (+2 more)

### Community 99 - "Community 99"
Cohesion: 0.16
Nodes (8): DEFAULT_TARGETS, Nutrition(), NUTRITION_TARGETS, MealGroupSection(), defaultGroupNameForTime(), QuickBarcodeLog(), MealGroup, NutritionLog

### Community 100 - "Community 100"
Cohesion: 0.18
Nodes (7): ContextAction, fmtScheduled(), formatDue(), iconForContextValue(), SubStats, TaskRowList(), TaskRowProps

### Community 101 - "Community 101"
Cohesion: 0.19
Nodes (8): PrivacyCtx, PrivacyProvider(), PrivacyState, usePrivacy(), fmtPercent(), fmtPlain(), Num(), NumFormat

### Community 102 - "Community 102"
Cohesion: 0.29
Nodes (11): _custom_hook(), _find_matching_paren(), Finding, lint_file(), main(), Given the index of an open `(`, return the index of its matching `)`.      Skips, A lint rule: a matcher that yields hits, plus the metadata each hit gets.      A, _regex_matcher() (+3 more)

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (12): ALLOWED_KINDS, ALLOWED_URGENCIES, CATEGORY_KEYWORDS, createRoutedRow(), deleteRoutedRow(), inferPurchaseCategory(), mergeClassification(), PATCH() (+4 more)

### Community 104 - "Community 104"
Cohesion: 0.18
Nodes (9): addDays(), fmtWeekRange(), Ingredient, MEAL_LABELS, MEAL_TYPES, MealEntry, MethodStep, Recipe (+1 more)

### Community 105 - "Community 105"
Cohesion: 0.18
Nodes (5): Capture, DecisionsClient(), SOURCES, SuggestCapture(), Toast

### Community 106 - "Community 106"
Cohesion: 0.21
Nodes (7): ArchiveEntry, FIELD_GRID, FIELD_LABELS, fmtDateRange(), fmtSavedRelative(), ReviewClient(), ReviewMeta

### Community 107 - "Community 107"
Cohesion: 0.17
Nodes (7): MatchedRule, Rule, RulesClient(), Scope, SCOPE_LABEL, TestResult, Toast

### Community 108 - "Community 108"
Cohesion: 0.23
Nodes (9): Operator(), fmtDate(), fmtTime(), greeting(), Session(), TopTask, OPERATOR, CaptureBox() (+1 more)

### Community 109 - "Community 109"
Cohesion: 0.17
Nodes (9): Cell(), ColumnDef, ColumnId, COLUMNS, fmtDate(), SortDir, SortState, TaskTableView() (+1 more)

### Community 110 - "Community 110"
Cohesion: 0.21
Nodes (7): ApiUsagePage(), formatTokens(), gbp(), InternalEstimate, TOOLTIP_STYLE, UsageData, usd()

### Community 111 - "Community 111"
Cohesion: 0.27
Nodes (9): markStaleSessionsAttempted(), SessionStatus, DailyNotes, cloneEmptySlots(), GET(), jsDayToProgrammeDow(), PATCH(), populateLiveOnly() (+1 more)

### Community 112 - "Community 112"
Cohesion: 0.23
Nodes (8): Toast, slugifyTypeKey(), SessionTypeLoggingMode, WorkoutSessionType, CreateBody, GET(), POST(), userId()

### Community 113 - "Community 113"
Cohesion: 0.18
Nodes (7): BRISTOL, BRISTOL_HEALTH, discomfortColor(), GutEntry, GutHealthPage(), TOD_LABELS, WIPE_LABELS

### Community 114 - "Community 114"
Cohesion: 0.33
Nodes (9): compute_band_edges(), compute_fft_bands(), decode_audio(), extract(), main(), Decode audio to mono float32 samples via ffmpeg., Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ., Compute peak magnitude in logarithmically-spaced frequency bands. (+1 more)

### Community 115 - "Community 115"
Cohesion: 0.24
Nodes (4): callClaudeJSON(), extractJson(), Estimate, Macros

### Community 116 - "Community 116"
Cohesion: 0.25
Nodes (8): findOrCreateAccount(), persistPayPalImport(), EXCEL_EXTENSIONS, excelToCsv(), isExcel(), PARSERS, POST(), userId()

### Community 117 - "Community 117"
Cohesion: 0.20
Nodes (7): DAYS, MEAL_SLOTS, MealSlot, PlannerGrid, Recipe, RecipesClient(), SAMPLE_RECIPES

### Community 118 - "Community 118"
Cohesion: 0.18
Nodes (7): Drop, EMPTY_MODAL, ModalState, RaffleEntry, RESULT_COLOURS, RESULT_LABELS, WishItem

### Community 119 - "Community 119"
Cohesion: 0.20
Nodes (4): TemplateKind, KINDS, Template, WorkoutNowClient()

### Community 120 - "Community 120"
Cohesion: 0.20
Nodes (8): activeKey(), ENTRIES, Entry, Glossary(), NodeDef, NodeKey, NODES, OrganismDiagram()

### Community 121 - "Community 121"
Cohesion: 0.25
Nodes (8): Investment, InvestmentsOverviewCard(), timeAgo(), fmt(), Money(), MoneyFormat, PrivateText(), REDACTED

### Community 122 - "Community 122"
Cohesion: 0.18
Nodes (9): normalizeApiTransactions(), bankLeg, conversion, financing, fundingLeg, payment, refund, rows (+1 more)

### Community 123 - "Community 123"
Cohesion: 0.38
Nodes (8): DELETE(), ensureOwned(), NUMERIC_FIELDS, PATCH(), PatchBody, sessionBelongsToUser(), STRING_FIELDS, userId()

### Community 124 - "Community 124"
Cohesion: 0.29
Nodes (8): normaliseRegion(), PAIN_SEED_ROWS, PainSeedRow, parseSeedRows(), parseSeverity(), REGION_MAP, POST(), userId()

### Community 125 - "Community 125"
Cohesion: 0.36
Nodes (8): GET(), GoalsNotes, POST(), readGoals(), userId(), GoalItem, GoalScope, isGoalItem()

### Community 126 - "Community 126"
Cohesion: 0.22
Nodes (5): BRISTOL_LABELS, BristolType, GutEntry, GutHealthClient(), SAMPLE_ENTRIES

### Community 127 - "Community 127"
Cohesion: 0.20
Nodes (7): Drop, EMPTY_MODAL, ModalState, STATUS_COLOURS, STATUS_LABELS, STATUSES, WishlistItem

### Community 128 - "Community 128"
Cohesion: 0.22
Nodes (3): DragState, fmtYmd(), TaskCalendarView()

### Community 129 - "Community 129"
Cohesion: 0.25
Nodes (4): AccountsClient(), AccountStatus, SAMPLE_ACCOUNTS, ServiceAccount

### Community 130 - "Community 130"
Cohesion: 0.33
Nodes (7): ALLOWED_SOURCES, Body, dateKey(), GET(), POST(), userId(), VALID_UNITS

### Community 131 - "Community 131"
Cohesion: 0.31
Nodes (8): anonymise(), ExportBody, META_COLS, POST(), SECTION_TABLES, stripMeta(), TableDef, toCsv()

### Community 132 - "Community 132"
Cohesion: 0.31
Nodes (5): GET(), POST(), userId(), DEFAULT_GROUPS, ensureMealGroups()

### Community 133 - "Community 133"
Cohesion: 0.31
Nodes (6): Drive, formatUptime(), Metric, PCDashboardPage(), tempColour(), usageColour()

### Community 134 - "Community 134"
Cohesion: 0.25
Nodes (6): DEFAULT_TYPES, EntityRulesClient(), EntityType, Rule, TYPE_DESCRIPTION, TYPE_LABEL

### Community 135 - "Community 135"
Cohesion: 0.31
Nodes (6): Calendar(), CalendarEvent, DAY_LABELS, fmtTime(), fmtTimeRange(), ymd()

### Community 136 - "Community 136"
Cohesion: 0.31
Nodes (7): CalendarDay, CalendarMonth(), DOW_LABELS, monthLabel(), monthParam(), Props, shiftMonth()

### Community 137 - "Community 137"
Cohesion: 0.22
Nodes (6): ProgrammeSession, Props, SessionSwapDropdown(), SLOT_SHORT, TemplateSlotLike, DAY_SHORT

### Community 138 - "Community 138"
Cohesion: 0.28
Nodes (8): classifyPayPalRows(), detectPayPal(), parsePayPalAmount(), parsePayPalCsv(), PAYPAL_ACCOUNT, PayPalImportResult, PayPalPaymentRow, PayPalSummary

### Community 139 - "Community 139"
Cohesion: 0.42
Nodes (8): body_metrics, workout_programme_exercises, workout_programme_phases, workout_programme_sessions, workout_programmes, workout_session_exercises, workout_sessions, workout_sets

### Community 140 - "Community 140"
Cohesion: 0.32
Nodes (7): CATEGORIES, CreateBody, GET(), PERIODS, POST(), STATUSES, userId()

### Community 141 - "Community 141"
Cohesion: 0.32
Nodes (6): GET(), ImportPayload, MetricEntry, POST(), userId(), WorkoutEntry

### Community 142 - "Community 142"
Cohesion: 0.39
Nodes (6): getUiPrefs(), UI_PREFS_DEFAULTS, UiPrefs, GET(), PATCH(), UID()

### Community 143 - "Community 143"
Cohesion: 0.43
Nodes (7): buildPickForLLM(), callClaude(), extractJson(), POST(), SmartTask, textSearch(), validateLLM()

### Community 144 - "Community 144"
Cohesion: 0.29
Nodes (4): BloodMarker, BloodTestsClient(), MarkerStatus, SAMPLE_MARKERS

### Community 145 - "Community 145"
Cohesion: 0.25
Nodes (6): DIFF_COLOURS, DIFF_LABELS, DIFFICULTIES, EMPTY_MODAL, Guide, ModalState

### Community 146 - "Community 146"
Cohesion: 0.32
Nodes (6): EyeCard(), fmtNum(), formatDate(), Prescription, PrescriptionPair, VisionPage()

### Community 147 - "Community 147"
Cohesion: 0.32
Nodes (3): avatarColor(), PersonDetail(), SOURCE_ICON

### Community 148 - "Community 148"
Cohesion: 0.36
Nodes (7): Bins(), BinsResponse, Collection, daysUntil(), formatDay(), TypeIcon(), typeStyle()

### Community 149 - "Community 149"
Cohesion: 0.32
Nodes (6): KeyBlockers(), Pill(), pillLabel(), Response, tone(), BlockerRow

### Community 150 - "Community 150"
Cohesion: 0.25
Nodes (5): OUT, svg180, svg192, svg512, svgMask

### Community 151 - "Community 151"
Cohesion: 0.61
Nodes (7): assert(), main(), testAmex(), testAutoDetect(), testHalifax(), testPayPal(), testRevolut()

### Community 152 - "Community 152"
Cohesion: 0.48
Nodes (6): CacheEntry, costPerMTok(), fetchAnthropicUsage(), fetchInternalUsage(), fetchOpenAIUsage(), GET()

### Community 153 - "Community 153"
Cohesion: 0.38
Nodes (3): signToken(), POST(), timingSafeEqual()

### Community 154 - "Community 154"
Cohesion: 0.43
Nodes (5): CreatePayload, GET(), nextDue(), POST(), userId()

### Community 155 - "Community 155"
Cohesion: 0.38
Nodes (5): MOBILITY_SEED, MobilitySeedRow, ExerciseDataShape, POST(), userId()

### Community 156 - "Community 156"
Cohesion: 0.33
Nodes (5): DateSelector(), DOW_LABEL, fmtLongDate(), WeekDay, WeekSummary

### Community 157 - "Community 157"
Cohesion: 0.43
Nodes (6): config, isPublic(), middleware(), PUBLIC_PREFIXES, timingSafeEqual(), verifyHmac()

### Community 158 - "Community 158"
Cohesion: 0.33
Nodes (6): audit_log, daily_logs, entities, memory_chunks, raw_captures, tasks

### Community 159 - "Community 159"
Cohesion: 0.60
Nodes (5): DELETE(), ensureOwned(), PATCH(), PatchBody, userId()

### Community 160 - "Community 160"
Cohesion: 0.47
Nodes (5): GET(), PATCH(), PatchBody, TYPES, userId()

### Community 161 - "Community 161"
Cohesion: 0.53
Nodes (4): extractFinance(), getLatestSnapshot(), getSnapshotHistory(), FinanceData

### Community 162 - "Community 162"
Cohesion: 0.47
Nodes (4): fetchCoinGeckoPrice(), fetchYahooPrice(), Investment, lookupPrice()

### Community 163 - "Community 163"
Cohesion: 0.40
Nodes (3): extractJsonBlock(), KNOWN_MARKERS, POST()

### Community 164 - "Community 164"
Cohesion: 0.33
Nodes (3): PostBody, ResultRow, SessionRow

### Community 165 - "Community 165"
Cohesion: 0.53
Nodes (5): coerce(), Extracted, extractJsonBlock(), POST(), safeNum()

### Community 166 - "Community 166"
Cohesion: 0.47
Nodes (4): POST(), userId(), migrateFromEntities(), MigrationStats

### Community 167 - "Community 167"
Cohesion: 0.53
Nodes (5): CreatePayload, extractCoordsFromGoogleMaps(), GET(), POST(), userId()

### Community 168 - "Community 168"
Cohesion: 0.53
Nodes (5): CreatePayload, GET(), londonDayStart(), POST(), userId()

### Community 169 - "Community 169"
Cohesion: 0.33
Nodes (3): Ingredient, MethodStep, Recipe

### Community 170 - "Community 170"
Cohesion: 0.33
Nodes (3): ShoppingItemLegacy, ShoppingItemNew, ShoppingList

### Community 171 - "Community 171"
Cohesion: 0.53
Nodes (5): Fuel(), relativeTime(), shortAddress(), StationRow(), topNCheapest()

### Community 172 - "Community 172"
Cohesion: 0.53
Nodes (5): cook_guides, drop_monitors, drops, raffle_entries, wishlist_items

### Community 173 - "Community 173"
Cohesion: 0.40
Nodes (3): Ad, PLATFORM_COLOURS, Venture

### Community 174 - "Community 174"
Cohesion: 0.60
Nodes (3): AsyncMetadataDriven(), calculateMetadata(), Props

### Community 175 - "Community 175"
Cohesion: 0.60
Nodes (3): BadComposition(), calculateMetadata(), useFadeMixed()

### Community 176 - "Community 176"
Cohesion: 0.70
Nodes (3): MyComposition(), pick(), TitleCard()

### Community 177 - "Community 177"
Cohesion: 0.60
Nodes (4): Programme, GET(), POST(), userId()

### Community 178 - "Community 178"
Cohesion: 0.60
Nodes (3): Body, POST(), userId()

### Community 179 - "Community 179"
Cohesion: 0.60
Nodes (4): CreatePayload, GET(), POST(), userId()

### Community 180 - "Community 180"
Cohesion: 0.60
Nodes (4): CreateBody, GET(), POST(), userId()

### Community 181 - "Community 181"
Cohesion: 0.50
Nodes (4): GET(), OWMDaily, transformDaily(), WeatherDay

### Community 182 - "Community 182"
Cohesion: 0.40
Nodes (2): DIFF_LABELS, Guide

### Community 183 - "Community 183"
Cohesion: 0.50
Nodes (2): StudioSubNav(), TABS

### Community 184 - "Community 184"
Cohesion: 0.60
Nodes (4): computeNext(), fmtHHMM(), SunData, SunWidget()

### Community 185 - "Community 185"
Cohesion: 0.50
Nodes (4): ContextRow, STOPWORDS, suggestContext(), tokens()

### Community 186 - "Community 186"
Cohesion: 0.70
Nodes (4): agent_conversations, agent_memory, agent_messages, agents

### Community 187 - "Community 187"
Cohesion: 0.70
Nodes (4): venture_ads, venture_inspiration, venture_steps, ventures

### Community 188 - "Community 188"
Cohesion: 0.40
Nodes (4): auth, drive, { google }, normalisedKey

### Community 189 - "Community 189"
Cohesion: 0.67
Nodes (2): LambdaConfigured(), renderViaLambda()

### Community 190 - "Community 190"
Cohesion: 0.67
Nodes (2): handle, WarningsOnly()

### Community 191 - "Community 191"
Cohesion: 0.83
Nodes (2): CustomHookDriven(), useFadeIn()

### Community 192 - "Community 192"
Cohesion: 0.67
Nodes (2): Item, MixedBlockers()

### Community 193 - "Community 193"
Cohesion: 0.83
Nodes (3): callClaude(), POST(), userId()

### Community 194 - "Community 194"
Cohesion: 0.50
Nodes (1): Ctx

### Community 195 - "Community 195"
Cohesion: 0.50
Nodes (2): SECTION_DEFS, SectionDef

### Community 196 - "Community 196"
Cohesion: 0.50
Nodes (3): CATEGORIES, PERIODS, STATUSES

### Community 197 - "Community 197"
Cohesion: 0.83
Nodes (3): GET(), POST(), userId()

### Community 198 - "Community 198"
Cohesion: 0.50
Nodes (1): EyeRow

### Community 199 - "Community 199"
Cohesion: 0.50
Nodes (1): ItemShape

### Community 200 - "Community 200"
Cohesion: 0.50
Nodes (1): Ingredient

### Community 201 - "Community 201"
Cohesion: 0.67
Nodes (3): POST(), searchTitle(), StreamingOption

### Community 202 - "Community 202"
Cohesion: 0.83
Nodes (3): GET(), POST(), userId()

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (3): GET(), userId(), MentionWithSnippet

### Community 204 - "Community 204"
Cohesion: 0.83
Nodes (3): GET(), PATCH(), UID()

### Community 205 - "Community 205"
Cohesion: 0.50
Nodes (2): RecentlyPlayedResponse, SpotifyTrack

### Community 206 - "Community 206"
Cohesion: 0.50
Nodes (2): lookupStreaming(), StreamingOption

### Community 207 - "Community 207"
Cohesion: 0.67
Nodes (3): exercise_baselines, exercise_pain_logs, workout_session_exercises

### Community 208 - "Community 208"
Cohesion: 0.83
Nodes (3): people, people_aliases, people_mentions

### Community 209 - "Community 209"
Cohesion: 0.83
Nodes (3): task_activity, task_comments, tasks

### Community 210 - "Community 210"
Cohesion: 0.83
Nodes (3): foods, meal_groups, nutrition_logs

### Community 211 - "Community 211"
Cohesion: 0.67
Nodes (3): entity_review_rules, pending_entities, raw_captures

### Community 212 - "Community 212"
Cohesion: 0.83
Nodes (3): blood_test_markers, blood_test_results, blood_test_sessions

### Community 213 - "Community 213"
Cohesion: 0.67
Nodes (3): meal_plan, recipes, shopping_lists

### Community 214 - "Community 214"
Cohesion: 0.50
Nodes (3): bin_garden_seasons, bin_google_events, bin_schedule_config

### Community 215 - "Community 215"
Cohesion: 0.50
Nodes (2): config, si

### Community 216 - "Community 216"
Cohesion: 0.67
Nodes (1): StateDriven()

### Community 217 - "Community 217"
Cohesion: 0.67
Nodes (1): SideEffectDriven()

### Community 218 - "Community 218"
Cohesion: 0.67
Nodes (1): MuiDriven()

### Community 219 - "Community 219"
Cohesion: 0.67
Nodes (1): VOICE_MAP

### Community 220 - "Community 220"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 221 - "Community 221"
Cohesion: 1.00
Nodes (2): GET(), userId()

### Community 222 - "Community 222"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 223 - "Community 223"
Cohesion: 1.00
Nodes (2): GET(), UID()

### Community 229 - "Community 229"
Cohesion: 1.00
Nodes (2): GET(), userId()

### Community 230 - "Community 230"
Cohesion: 0.67
Nodes (1): PlayRow

### Community 232 - "Community 232"
Cohesion: 1.00
Nodes (2): DELETE(), userId()

### Community 233 - "Community 233"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 234 - "Community 234"
Cohesion: 1.00
Nodes (2): DELETE(), userId()

### Community 235 - "Community 235"
Cohesion: 1.00
Nodes (2): POST(), userId()

### Community 236 - "Community 236"
Cohesion: 0.67
Nodes (1): TaskRow

### Community 242 - "Community 242"
Cohesion: 0.67
Nodes (1): serwist

### Community 243 - "Community 243"
Cohesion: 0.67
Nodes (2): format_output(), Format results for Claude consumption (token-optimized)

### Community 244 - "Community 244"
Cohesion: 0.67
Nodes (1): Format

### Community 245 - "Community 245"
Cohesion: 1.00
Nodes (2): purchases, raw_captures

### Community 246 - "Community 246"
Cohesion: 1.00
Nodes (2): workout_exercises, workouts

### Community 247 - "Community 247"
Cohesion: 1.00
Nodes (2): bank_accounts, transactions

### Community 248 - "Community 248"
Cohesion: 1.00
Nodes (2): paypal_payments, transactions

### Community 249 - "Community 249"
Cohesion: 1.00
Nodes (2): auth.users, push_subscriptions

### Community 250 - "Community 250"
Cohesion: 1.00
Nodes (2): supplement_logs, supplements

### Community 251 - "Community 251"
Cohesion: 0.67
Nodes (2): health_metrics, health_workouts

### Community 253 - "Community 253"
Cohesion: 1.00
Nodes (2): media_items, raw_captures

### Community 254 - "Community 254"
Cohesion: 1.00
Nodes (2): media_episodes, media_items

### Community 255 - "Community 255"
Cohesion: 0.67
Nodes (2): nextConfig, withSerwist

### Community 256 - "Community 256"
Cohesion: 0.67
Nodes (2): path, svc

### Community 257 - "Community 257"
Cohesion: 0.67
Nodes (2): path, svc

### Community 263 - "Community 263"
Cohesion: 1.00
Nodes (1): eslintConfig

### Community 266 - "Community 266"
Cohesion: 1.00
Nodes (1): pending_workout_routes

### Community 267 - "Community 267"
Cohesion: 1.00
Nodes (1): workout_session_types

### Community 268 - "Community 268"
Cohesion: 1.00
Nodes (1): dashboard_layouts

### Community 269 - "Community 269"
Cohesion: 1.00
Nodes (1): projects

### Community 270 - "Community 270"
Cohesion: 1.00
Nodes (1): routing_rules

### Community 271 - "Community 271"
Cohesion: 1.00
Nodes (1): context_options

### Community 272 - "Community 272"
Cohesion: 1.00
Nodes (1): pc_components

### Community 273 - "Community 273"
Cohesion: 1.00
Nodes (1): places

### Community 274 - "Community 274"
Cohesion: 1.00
Nodes (1): reminders

### Community 275 - "Community 275"
Cohesion: 1.00
Nodes (1): exercise_aliases

### Community 277 - "Community 277"
Cohesion: 1.00
Nodes (1): gut_health_logs

### Community 278 - "Community 278"
Cohesion: 1.00
Nodes (1): eye_prescriptions

### Community 279 - "Community 279"
Cohesion: 1.00
Nodes (1): spotify_plays

### Community 280 - "Community 280"
Cohesion: 1.00
Nodes (1): pc_metrics

### Community 281 - "Community 281"
Cohesion: 1.00
Nodes (1): user_settings

### Community 282 - "Community 282"
Cohesion: 1.00
Nodes (1): weather_cache

### Community 283 - "Community 283"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **807 isolated node(s):** `Decode audio to mono float32 samples via ffmpeg.`, `Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ.`, `Compute peak magnitude in logarithmically-spaced frequency bands.`, `Extract per-frame audio data.`, `A lint rule: a matcher that yields hits, plus the metadata each hit gets.      A` (+802 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 182`** (2 nodes): `DIFF_LABELS`, `Guide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (2 nodes): `StudioSubNav()`, `TABS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (2 nodes): `LambdaConfigured()`, `renderViaLambda()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (2 nodes): `handle`, `WarningsOnly()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (2 nodes): `CustomHookDriven()`, `useFadeIn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (2 nodes): `Item`, `MixedBlockers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `Ctx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (2 nodes): `SECTION_DEFS`, `SectionDef`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (1 nodes): `EyeRow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (1 nodes): `ItemShape`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `Ingredient`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (2 nodes): `RecentlyPlayedResponse`, `SpotifyTrack`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (2 nodes): `lookupStreaming()`, `StreamingOption`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (2 nodes): `config`, `si`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (1 nodes): `StateDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (1 nodes): `SideEffectDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (1 nodes): `MuiDriven()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (1 nodes): `VOICE_MAP`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 220`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (2 nodes): `GET()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 222`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 223`** (2 nodes): `GET()`, `UID()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 229`** (2 nodes): `GET()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 230`** (1 nodes): `PlayRow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 232`** (2 nodes): `DELETE()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 233`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 234`** (2 nodes): `DELETE()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 235`** (2 nodes): `POST()`, `userId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (1 nodes): `TaskRow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 242`** (1 nodes): `serwist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 243`** (2 nodes): `format_output()`, `Format results for Claude consumption (token-optimized)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 244`** (1 nodes): `Format`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 245`** (2 nodes): `purchases`, `raw_captures`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 246`** (2 nodes): `workout_exercises`, `workouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 247`** (2 nodes): `bank_accounts`, `transactions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (2 nodes): `paypal_payments`, `transactions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 249`** (2 nodes): `auth.users`, `push_subscriptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (2 nodes): `supplement_logs`, `supplements`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 251`** (2 nodes): `health_metrics`, `health_workouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 253`** (2 nodes): `media_items`, `raw_captures`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (2 nodes): `media_episodes`, `media_items`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 255`** (2 nodes): `nextConfig`, `withSerwist`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 256`** (2 nodes): `path`, `svc`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 257`** (2 nodes): `path`, `svc`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 263`** (1 nodes): `eslintConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 266`** (1 nodes): `pending_workout_routes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 267`** (1 nodes): `workout_session_types`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 268`** (1 nodes): `dashboard_layouts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 269`** (1 nodes): `projects`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 270`** (1 nodes): `routing_rules`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 271`** (1 nodes): `context_options`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 272`** (1 nodes): `pc_components`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 273`** (1 nodes): `places`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 274`** (1 nodes): `reminders`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 275`** (1 nodes): `exercise_aliases`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 277`** (1 nodes): `gut_health_logs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 278`** (1 nodes): `eye_prescriptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 279`** (1 nodes): `spotify_plays`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 280`** (1 nodes): `pc_metrics`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 281`** (1 nodes): `user_settings`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 282`** (1 nodes): `weather_cache`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 283`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createServerClient()` connect `Community 9` to `Community 42`, `Community 193`, `Community 3`, `Community 40`, `Community 68`, `Community 130`, `Community 48`, `Community 53`, `Community 103`, `Community 8`, `Community 23`, `Community 94`, `Community 58`, `Community 154`, `Community 111`, `Community 220`, `Community 43`, `Community 194`, `Community 5`, `Community 95`, `Community 160`, `Community 195`, `Community 131`, `Community 161`, `Community 162`, `Community 44`, `Community 96`, `Community 72`, `Community 196`, `Community 140`, `Community 73`, `Community 80`, `Community 116`, `Community 221`, `Community 34`, `Community 7`, `Community 197`, `Community 10`, `Community 59`, `Community 88`, `Community 13`, `Community 22`, `Community 123`, `Community 1`, `Community 69`, `Community 177`, `Community 155`, `Community 124`, `Community 89`, `Community 112`, `Community 222`, `Community 37`, `Community 178`, `Community 125`, `Community 223`, `Community 45`, `Community 141`, `Community 164`, `Community 198`, `Community 224`, `Community 225`, `Community 226`, `Community 199`, `Community 200`, `Community 70`, `Community 227`, `Community 228`, `Community 14`, `Community 74`, `Community 82`, `Community 202`, `Community 75`, `Community 24`, `Community 132`, `Community 152`, `Community 179`, `Community 229`, `Community 159`, `Community 67`, `Community 203`, `Community 166`, `Community 180`, `Community 167`, `Community 54`, `Community 18`, `Community 83`, `Community 38`, `Community 41`, `Community 204`, `Community 142`, `Community 230`, `Community 205`, `Community 231`, `Community 232`, `Community 233`, `Community 168`, `Community 234`, `Community 235`, `Community 4`, `Community 143`, `Community 236`, `Community 29`, `Community 238`, `Community 237`, `Community 239`, `Community 240`, `Community 181`, `Community 98`, `Community 12`, `Community 31`, `Community 77`, `Community 86`, `Community 16`, `Community 81`, `Community 33`, `Community 90`, `Community 66`, `Community 206`, `Community 55`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Why does `Mono()` connect `Community 2` to `Community 25`, `Community 182`, `Community 145`, `Community 118`, `Community 127`, `Community 16`, `Community 110`, `Community 50`, `Community 133`, `Community 71`, `Community 173`, `Community 52`, `Community 27`, `Community 85`, `Community 105`, `Community 14`, `Community 57`, `Community 147`, `Community 54`, `Community 62`, `Community 18`, `Community 36`, `Community 100`, `Community 148`, `Community 135`, `Community 35`, `Community 15`, `Community 32`, `Community 171`, `Community 120`, `Community 43`, `Community 47`, `Community 149`, `Community 23`, `Community 99`, `Community 108`, `Community 51`, `Community 93`, `Community 60`, `Community 121`, `Community 46`, `Community 37`, `Community 98`, `Community 136`, `Community 10`, `Community 7`, `Community 59`, `Community 12`, `Community 22`, `Community 1`, `Community 56`, `Community 88`, `Community 70`, `Community 92`, `Community 78`, `Community 106`, `Community 3`, `Community 107`, `Community 31`, `Community 28`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `localDateKey()` connect `Community 24` to `Community 40`, `Community 130`, `Community 53`, `Community 103`, `Community 111`, `Community 69`, `Community 11`, `Community 45`, `Community 70`, `Community 29`, `Community 98`, `Community 90`, `Community 39`, `Community 15`, `Community 99`, `Community 47`, `Community 37`, `Community 12`, `Community 32`, `Community 119`, `Community 16`, `Community 2`, `Community 86`, `Community 161`, `Community 66`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `Decode audio to mono float32 samples via ffmpeg.`, `Logarithmically-spaced frequency band edges from MIN_FREQ to MAX_FREQ.`, `Compute peak magnitude in logarithmically-spaced frequency bands.` to the rest of the system?**
  _807 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05740740740740741 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06502816180235535 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04590163934426229 - nodes in this community are weakly interconnected._
/**
 * MatchMaker - i18n module
 *
 * Flat key → string dictionaries for Simplified Chinese (zh-CN) and
 * American English (en-US). At load time the browser's preferred
 * language is auto-detected, and a per-device override is stored in
 * localStorage under 'matchmaker-lang'.
 *
 * API:
 *   t(key, params?)      — translate a key (falls back to en-US, then the
 *                          key itself). `params` is an object of
 *                          `{name: value}` pairs substituted into `{name}`.
 *   I18N.init()          — detect language, apply to DOM, read saved override
 *   I18N.set(lang)       — persist + re-apply
 *   I18N.getLang()       — current language code
 *   I18N.supported()     — list of supported codes
 *
 * DOM wiring (for static strings in index.html):
 *   data-i18n="key"           → sets textContent
 *   data-i18n-ph="key"        → sets placeholder attribute
 *   data-i18n-title="key"     → sets title attribute
 */

const I18N_STORAGE_KEY = 'matchmaker-lang';

const TRANSLATIONS = {
  'zh-CN': {
    // ─── Meta / header ───────────────────────────────────────
    'app.title': 'MatchMaker - 杯赛助手',
    'app.header': '🏆 MatchMaker',
    'app.subtitle': '每周杯赛助手',

    // ─── Update banner ───────────────────────────────────────
    'update.available': '✨ 有新版本可用',
    'update.reload': '立即更新',

    // ─── Common / buttons ────────────────────────────────────
    'common.back': '← 返回',
    'common.back_home': '← 返回主页',
    'common.add': '添加',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.ok': '确定',
    'common.delete': '删除',
    'common.yes': '是',
    'common.no': '否',
    'common.empty': '暂无数据',

    // ─── Language selector ───────────────────────────────────
    'lang.label': '语言',
    'lang.zh-CN': '简体中文',
    'lang.en-US': 'English',

    // ─── Home ────────────────────────────────────────────────
    'home.title': '主页',
    'home.btn.start': '开始本周比赛',
    'home.btn.db': '📇 选手数据库',
    'home.btn.search': '🔍 选手查询',
    'home.btn.resume': '继续未完成的比赛 (阶段: {phase}) →',
    'home.stats.players': '已注册选手',
    'home.stats.weeks': '最多参与周数',
    'home.leaderboard.empty': '尚无选手。点击"选手数据库"添加。',
    'home.tab.points': '积分榜',
    'home.tab.winrate': '胜率榜',
    'home.tab.participation': '参与榜',
    'home.lb.points': '{n} 分',
    'home.lb.games': '{n} 场',
    'home.lb.events': '{n} 周',
    'home.lb.wld': '{w}胜 {d}平 {l}负',

    // ─── Expense card ────────────────────────────────────────
    'expense.title': '消费统计',
    'expense.total': '累计总消费',
    'expense.copy': '📋 复制消费信息',
    'expense.reset': '🗑 清零消费',
    'expense.undo': '↩ 恢复上次数据',
    'expense.hint.has_backup': '上次清零的数据已备份，可在下次比赛提交前恢复。',
    'expense.confirm.reset1': '确定要将所有选手的累计消费清零吗？\n\n当前总额：{total}\n\n此操作可在下次比赛提交前恢复。',
    'expense.confirm.reset2': '再次确认：清零？',
    'expense.confirm.undo': '恢复上次清零前的消费数据？',
    'expense.alert.already_zero': '当前消费总额已为零。',
    'expense.alert.nothing_to_undo': '无可恢复的数据。',
    'expense.text.header': '💰 MatchMaker 消费统计',
    'expense.text.total': '· 总消费：{total}',
    'expense.text.row': '· {name}：{amount}',

    // ─── Player DB ───────────────────────────────────────────
    'db.title': '选手数据库',
    'db.add.label': '添加选手',
    'db.add.placeholder': '输入姓名',
    'db.empty': '尚无选手。',
    'db.io.title': '数据导入 / 导出',
    'db.io.export': '📤 导出 JSON',
    'db.io.import': '📥 导入 JSON',
    'db.io.hint': '导出包含全部选手、比赛历史和未完成比赛。导入会覆盖现有数据。',
    'db.row.stats': '{events} 周 · {games} 场 · {wld} · 消费 {spent}',
    'db.row.main': '{points} 分 · {wr}',
    'db.confirm.delete': '删除 {name} 吗？积分将丢失。',
    'db.alert.add_failed': '姓名为空或已存在。',
    'bulk_add.toggle': '📋 从微信接龙批量粘贴',
    'bulk_add.placeholder': '把整段接龙消息粘贴到这里，例如：\n\n1. 张三\n2. 李四\n3. 王五\n...',
    'bulk_add.hint': '识别"数字. 名字"格式，已存在的选手会被自动忽略（不区分大小写）。',
    'bulk_add.submit': '解析并添加',
    'bulk_add.empty_input': '请先粘贴接龙消息。',
    'bulk_add.no_names': '未识别到任何选手姓名。请确认每行格式是"数字. 名字"。',
    'bulk_add.result': '已添加 {added} 名新选手，跳过 {skipped} 名已存在选手。',
    'db.select.toggle': '☑ 批量选择',
    'db.select.cancel': '✕ 取消选择',
    'db.select.all': '全选',
    'db.select.delete': '🗑 删除已选',
    'db.select.empty': '请先选择要删除的选手。',
    'db.select.confirm1': '确定要删除选中的 {n} 名选手吗？所有积分和历史数据都将丢失。',
    'db.select.confirm2': '再次确认：删除？',

    // ─── Player search ──────────────────────────────────────
    'search.title': '选手查询',
    'search.placeholder': '输入姓名搜索...',
    'search.empty.db': '尚无选手。先在选手数据库中添加。',
    'search.no_results': '未找到与"{q}"匹配的选手。',
    'search.row.summary': '{points} 分 · {wr}',

    // ─── Player detail ──────────────────────────────────────
    'player.stats.points': '积分',
    'player.stats.winrate': '胜率',
    'player.stats.games': '比赛场次',
    'player.stats.weeks': '参与周数',
    'player.stats.spent': '累计消费',
    'player.stats.wdl': '胜/平/负',
    'player.h2h.title': '对位胜率',
    'player.h2h.empty': '尚无对位记录。完成几场比赛后这里会出现统计。',
    'player.trend.title': '胜率趋势',
    'player.trend.empty': '至少需要参加 2 场比赛才能展示趋势。',
    'player.trend.summary': '{events} 场比赛 · 当前 {current} · 历史最高 {peak}',

    // ─── Event setup ─────────────────────────────────────────
    'setup.title': '本周比赛设置',
    'setup.params.mode': '比赛模式',
    'setup.mode.auto': '自动 (推荐)',
    'setup.mode.groups_knockout': '小组赛 + 淘汰赛',
    'setup.mode.round_robin': '纯小组赛 (循环赛)',
    'setup.mode.knockout': '纯淘汰赛 (单败)',
    'setup.mode.friendly': '纯友谊赛 (不计积分)',
    'setup.mode.hint': '"自动"会根据队伍数量和时间智能选择；其他选项是显式指定，不可用时会提示并阻止下一步。',
    'setup.alert.mode_infeasible': '"{mode}" 模式无法在当前条件下进行：\n\n{reason}\n\n请调整人数 / 场地 / 时间，或者选择其他模式。',

    'setup.section.attendees': '1. 选择本周参赛选手',
    'setup.attendees.selected': '已选 {n} 人',
    'setup.attendees.quickadd.placeholder': '快速添加新选手',
    'setup.section.params': '2. 比赛参数',
    'setup.params.team_size': '每队人数',
    'setup.params.courts': '场地数',
    'setup.params.duration': '每场时长（分）',
    'setup.params.total': '总时间（分）',
    'setup.section.expense': '3. 本周消费',
    'setup.expense.hint': '将均摊到本周所有参赛人员',
    'setup.btn.form': '生成队伍',
    'setup.alert.need_players': '至少需要 {n} 人才能组队。',
    'setup.empty.db': '先在"选手数据库"中添加选手。',

    // ─── Teams view ──────────────────────────────────────────
    'teams.title': '队伍分组',
    'teams.hint': '共 {count} 支队伍，每队 {size} 人。',
    'teams.hint.swap': '共 {count} 支队伍，每队 {size} 人。点击两位选手进行交换。',
    'teams.btn.reshuffle': '🔄 重新随机',
    'teams.btn.swap.start': '🔀 手动调整',
    'teams.btn.swap.done': '✓ 完成调整',
    'teams.btn.copy': '📋 复制比赛安排',
    'teams.btn.start': '开始比赛',
    'teams.format.recommended': '📋 推荐赛制',
    'teams.format.round_robin': '单循环赛',
    'teams.format.groups_knockout': '小组赛 + 淘汰赛 (小组: {groups}, 淘汰: {n}强)',
    'teams.format.knockout': '单败淘汰赛 ({n}支队)',
    'teams.format.random_fair': '随机配对（公平模式）',
    'teams.format.friendly': '纯友谊赛 (不计积分)',
    'teams.format.stats': '{ranked} 场正赛 · {slots} 个时间段 · 约 {min} 分钟',
    'teams.format.stats_friendly': '{friendly} 场友谊赛 · {slots} 个时间段 · 约 {min} 分钟',
    'teams.format.infeasible': '⚠️ 方案不可行：{reason}',
    'teams.notice.auto_fallback': '⚠️ 时间不足以完成完整杯赛，自动模式已切换为随机配对（按胜率分组保证比赛公平）。每场比赛的队伍都会重新组合，比赛结果不计入积分，但胜率会更新。',
    'teams.notice.friendly_explicit': '🤝 纯友谊赛模式：比赛不计入积分，但胜率会更新。每场比赛会按胜率重新组队保证公平，所有人都会轮流上场。点击"重新随机"可以换一批配对。',

    // ─── Tournament view ─────────────────────────────────────
    'tour.title': '比赛进行中',
    'tour.btn.copy': '📋 复制比赛安排',
    'tour.progress': '{done} / {total} 场已完成',
    'tour.slot': '时间段 {n}',
    'tour.round.num': '第{n}轮',
    'tour.phase.round_robin': '循环赛',
    'tour.phase.group': '小组赛',
    'tour.phase.knockout': '淘汰赛',
    'tour.phase.random_fair': '随机配对',
    'tour.phase.friendly': '友谊赛',
    'tour.court': '场地 {n}',
    'tour.court.friendly': '场地 {n} · 自由场',
    'tour.friendly.note': '被淘汰的队伍可在此场地自由组队比赛（不计积分）',
    'tour.vs': 'VS',
    'tour.result.a': 'A胜',
    'tour.result.d': '平局',
    'tour.result.b': 'B胜',
    'tour.score.placeholder': '得分',
    'tour.btn.finish': '完成比赛 & 更新积分',
    'tour.confirm.finish': '确认比赛结束？积分将写入数据库。',
    'tour.error.finish': '完成比赛时出错：{msg}',

    // ─── Done view ───────────────────────────────────────────
    'done.title': '🎉 比赛结束',
    'done.btn.home': '返回主页',
    'done.delta.title': '本轮积分变化',
    'done.delta.row': '+{pts} 分',
    'done.friendly.note': '🤝 本场是友谊赛 —— 不计积分，但胜率（胜/平/负）已更新。',
    'done.friendly.stats': '完成 {played}/{total} 场友谊赛 · 共 {attendees} 人参与',
    'done.friendly.records': '本轮战绩',

    // ─── Backup (post-event auto-download + share) ──────────
    'backup.notice.success': '备份已自动下载到本机。强烈建议把它发到微信"文件传输助手"作为云备份，防止换手机或浏览器清理时数据丢失。',
    'backup.notice.failed': '⚠️ 自动备份失败！请手动从"选手数据库 → 导出 JSON"导出一份。',
    'backup.share': '📤 分享备份到微信 / 邮件',
    'backup.share.fallback': '当前浏览器不支持文件分享，已改为下载到本机。请从下载文件夹手动分享。',
    'backup.share.failed': '分享失败：{msg}',

    // ─── History view ────────────────────────────────────────
    'hist.title': '历史记录',
    'hist.empty': '尚无历史记录。完成一场比赛后这里会出现。',
    'hist.row.summary': '{teams} 队 · {players} 人 · {done}/{total} 场',
    'hist.detail.teams': '队伍',
    'hist.detail.matches': '比赛结果',
    'hist.detail.deltas': '积分变化',
    'hist.detail.no_matches': '无结果',
    'hist.confirm.delete': '删除这条历史记录？此操作不会退回积分。',
    'hist.result.a_won': '{name} 胜',
    'hist.result.b_won': '{name} 胜',
    'hist.result.draw': '平局',

    // ─── Import / Export ─────────────────────────────────────
    'io.import.confirm': '导入将覆盖现有数据：\n  {players} 个选手\n  {history} 条历史记录\n\n确认继续？',
    'io.import.success': '导入成功。',
    'io.import.error': '导入失败：{msg}',
    'io.read.error': '读取文件失败。',

    // ─── Copy schedule ───────────────────────────────────────
    'copy.success': '✓ 已复制到剪贴板，可直接粘贴到聊天软件。',
    'copy.failure': '复制失败，请手动复制。',
    'copy.need_plan': '请先生成有效的比赛方案。',
    'copy.no_tournament': '没有正在进行的比赛。',

    // ─── Schedule text (used when building the copyable text) ─
    'text.header': '🏆 MatchMaker 比赛安排 · {date}',
    'text.header.no_date': '🏆 MatchMaker 比赛安排',
    'text.teams.header': '【队伍】共 {n} 队',
    'text.team.line': '· {name}：{players}',
    'text.format.header': '【赛制】{fmt}',
    'text.schedule.header': '【赛程】',
    'text.slot.header': '━━ 时段{n}{time} · {phase}{round} ━━',
    'text.slot.time': ' ({start}-{end})',
    'text.court.line': '  📍 场地{n}：{a} vs {b}',
    'text.friendly.line': '  📍 场地{n}：自由场（淘汰队伍友谊赛）',
    'text.summary': '共 {ranked} 场正赛 · {slots} 时段 · 约 {min} 分钟',
    'text.expense.line': '💰 本周消费：{total}（人均 {share}）',

    // ─── Phase labels (used on home "resume" button) ─────────
    'phase.setup': '设置',
    'phase.teams': '分组',
    'phase.running': '进行中',
    'phase.done': '已结束',

    // ─── Knockout placeholder labels ─────────────────────────
    'placeholder.group_rank': '小组{g} 第{r}名',
    'placeholder.kr_winner': 'KR{r}-M{m} 胜者',

    // ─── Misc / names ────────────────────────────────────────
    'team.default.name': '第{n}队',
    'text.name.separator': '、',
    'format.not_enough_teams': '队伍太少',
    'format.need_two_teams': '至少需要 2 支队伍',
    'format.out_of_time': '时间不足',
    'format.group_too_long': '小组赛超时',
    'format.ko_too_long': '淘汰赛超时',
    'format.groups_not_feasible': '时间不足以完成小组赛+淘汰赛',
    'form.insufficient_players': '至少需要 {n} 人 (当前 {m} 人)。',
  },

  'en-US': {
    // ─── Meta / header ───────────────────────────────────────
    'app.title': 'MatchMaker - Cup Assistant',
    'app.header': '🏆 MatchMaker',
    'app.subtitle': 'Weekly Cup Assistant',

    // ─── Update banner ───────────────────────────────────────
    'update.available': '✨ A new version is available',
    'update.reload': 'Update now',

    // ─── Common / buttons ────────────────────────────────────
    'common.back': '← Back',
    'common.back_home': '← Home',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.ok': 'OK',
    'common.delete': 'Delete',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.empty': 'No data',

    // ─── Language selector ───────────────────────────────────
    'lang.label': 'Language',
    'lang.zh-CN': '简体中文',
    'lang.en-US': 'English',

    // ─── Home ────────────────────────────────────────────────
    'home.title': 'Home',
    'home.btn.start': "Start this week's event",
    'home.btn.db': '📇 Player Database',
    'home.btn.search': '🔍 Find Player',
    'home.btn.resume': 'Resume event (phase: {phase}) →',
    'home.stats.players': 'Registered players',
    'home.stats.weeks': 'Most weeks played',
    'home.leaderboard.empty': 'No players yet. Tap "Player Database" to add.',
    'home.tab.points': 'Points',
    'home.tab.winrate': 'Win Rate',
    'home.tab.participation': 'Attendance',
    'home.lb.points': '{n} pts',
    'home.lb.games': '{n} games',
    'home.lb.events': '{n} weeks',
    'home.lb.wld': '{w}W {d}D {l}L',

    // ─── Expense card ────────────────────────────────────────
    'expense.title': 'Expense Summary',
    'expense.total': 'Total spent',
    'expense.copy': '📋 Copy expense info',
    'expense.reset': '🗑 Reset expenses',
    'expense.undo': '↩ Undo last reset',
    'expense.hint.has_backup': 'A backup of the prior totals is kept. You can restore it until the next event is committed.',
    'expense.confirm.reset1': "Reset everyone's accumulated spending?\n\nCurrent total: {total}\n\nThis can be undone until the next event is committed.",
    'expense.confirm.reset2': 'Really reset?',
    'expense.confirm.undo': 'Restore expense data from before the last reset?',
    'expense.alert.already_zero': 'Total expense is already zero.',
    'expense.alert.nothing_to_undo': 'Nothing to undo.',
    'expense.text.header': '💰 MatchMaker Expense Summary',
    'expense.text.total': '· Total: {total}',
    'expense.text.row': '· {name}: {amount}',

    // ─── Player DB ───────────────────────────────────────────
    'db.title': 'Player Database',
    'db.add.label': 'Add player',
    'db.add.placeholder': 'Enter name',
    'db.empty': 'No players yet.',
    'db.io.title': 'Import / Export',
    'db.io.export': '📤 Export JSON',
    'db.io.import': '📥 Import JSON',
    'db.io.hint': 'Export includes all players, history, and current event. Import overwrites existing data.',
    'db.row.stats': '{events} weeks · {games} games · {wld} · spent {spent}',
    'db.row.main': '{points} pts · {wr}',
    'db.confirm.delete': 'Delete {name}? Their points will be lost.',
    'db.alert.add_failed': 'Name is empty or already exists.',
    'bulk_add.toggle': '📋 Paste roster (numbered list)',
    'bulk_add.placeholder': 'Paste a numbered list of names, e.g.:\n\n1. Alice\n2. Bob\n3. Cara\n...',
    'bulk_add.hint': 'Recognises lines like "1. Name". Existing players are skipped (case-insensitive).',
    'bulk_add.submit': 'Parse and add',
    'bulk_add.empty_input': 'Paste a roster message first.',
    'bulk_add.no_names': 'No player names detected. Each line should look like "1. Name".',
    'bulk_add.result': 'Added {added} new players, skipped {skipped} existing.',
    'db.select.toggle': '☑ Bulk select',
    'db.select.cancel': '✕ Cancel',
    'db.select.all': 'Select all',
    'db.select.delete': '🗑 Delete selected',
    'db.select.empty': 'Select at least one player first.',
    'db.select.confirm1': 'Delete the {n} selected player(s)? All points and history will be lost.',
    'db.select.confirm2': 'Really delete?',

    // ─── Player search ──────────────────────────────────────
    'search.title': 'Find Player',
    'search.placeholder': 'Type a name...',
    'search.empty.db': 'No players yet. Add some in the Player Database first.',
    'search.no_results': 'No players matching "{q}".',
    'search.row.summary': '{points} pts · {wr}',

    // ─── Player detail ──────────────────────────────────────
    'player.stats.points': 'Points',
    'player.stats.winrate': 'Win Rate',
    'player.stats.games': 'Games',
    'player.stats.weeks': 'Weeks',
    'player.stats.spent': 'Total Spent',
    'player.stats.wdl': 'W/D/L',
    'player.h2h.title': 'Head-to-Head',
    'player.h2h.empty': 'No head-to-head records yet. Stats appear after a few completed matches.',
    'player.trend.title': 'Win Rate Over Time',
    'player.trend.empty': 'Need at least 2 events to chart a trend.',
    'player.trend.summary': '{events} events · current {current} · peak {peak}',

    // ─── Event setup ─────────────────────────────────────────
    'setup.title': "This Week's Event",
    'setup.params.mode': 'Tournament mode',
    'setup.mode.auto': 'Auto (recommended)',
    'setup.mode.groups_knockout': 'Groups + Knockout',
    'setup.mode.round_robin': 'Round-robin only',
    'setup.mode.knockout': 'Single elimination',
    'setup.mode.friendly': 'Friendly only (no points)',
    'setup.mode.hint': '"Auto" picks based on team count and time. The other options are explicit; if the chosen mode does not fit, you\'ll be alerted and blocked.',
    'setup.alert.mode_infeasible': '"{mode}" mode cannot run with the current settings:\n\n{reason}\n\nAdjust attendees / courts / time, or pick a different mode.',

    'setup.section.attendees': '1. Select attendees',
    'setup.attendees.selected': '{n} selected',
    'setup.attendees.quickadd.placeholder': 'Quick add a new player',
    'setup.section.params': '2. Match parameters',
    'setup.params.team_size': 'Players per team',
    'setup.params.courts': 'Courts',
    'setup.params.duration': 'Match duration (min)',
    'setup.params.total': 'Total time (min)',
    'setup.section.expense': "3. This week's expense",
    'setup.expense.hint': 'Will be split equally across attendees',
    'setup.btn.form': 'Generate teams',
    'setup.alert.need_players': 'Need at least {n} players to form teams.',
    'setup.empty.db': 'Add players in "Player Database" first.',

    // ─── Teams view ──────────────────────────────────────────
    'teams.title': 'Team Draft',
    'teams.hint': '{count} teams of {size}.',
    'teams.hint.swap': '{count} teams of {size}. Tap two players to swap them.',
    'teams.btn.reshuffle': '🔄 Re-randomize',
    'teams.btn.swap.start': '🔀 Manual swap',
    'teams.btn.swap.done': '✓ Done',
    'teams.btn.copy': '📋 Copy schedule',
    'teams.btn.start': 'Start tournament',
    'teams.format.recommended': '📋 Recommended format',
    'teams.format.round_robin': 'Round-robin',
    'teams.format.groups_knockout': 'Groups + Knockout (groups: {groups}, top {n} advance)',
    'teams.format.knockout': 'Single elimination ({n} teams)',
    'teams.format.random_fair': 'Random pairing (fair mode)',
    'teams.format.friendly': 'Friendly only (no points)',
    'teams.format.stats': '{ranked} ranked matches · {slots} slots · ~{min} min',
    'teams.format.stats_friendly': '{friendly} friendly matches · {slots} slots · ~{min} min',
    'teams.format.infeasible': '⚠️ Plan not feasible: {reason}',
    'teams.notice.auto_fallback': '⚠️ Not enough time for a full cup. Auto mode switched to random pairing (cohorts grouped by win rate to keep matches fair). Teams change every match — results don\'t award tournament points but win rate IS updated.',
    'teams.notice.friendly_explicit': '🤝 Friendly mode: matches don\'t award tournament points, but win rate IS updated. Teams are re-formed each match by win rate so everyone gets balanced playing time. Tap "Re-randomize" for a different set of pairings.',

    // ─── Tournament view ─────────────────────────────────────
    'tour.title': 'Tournament in progress',
    'tour.btn.copy': '📋 Copy schedule',
    'tour.progress': '{done} / {total} matches played',
    'tour.slot': 'Slot {n}',
    'tour.round.num': 'Round {n}',
    'tour.phase.round_robin': 'Round-robin',
    'tour.phase.group': 'Group',
    'tour.phase.knockout': 'Knockout',
    'tour.phase.random_fair': 'Random pairing',
    'tour.phase.friendly': 'Friendly',
    'tour.court': 'Court {n}',
    'tour.court.friendly': 'Court {n} · Friendly',
    'tour.friendly.note': 'Eliminated teams can freely play here (no points awarded)',
    'tour.vs': 'VS',
    'tour.result.a': 'A wins',
    'tour.result.d': 'Draw',
    'tour.result.b': 'B wins',
    'tour.score.placeholder': 'score',
    'tour.btn.finish': 'Finish & update points',
    'tour.confirm.finish': 'End the tournament? Points will be written to the database.',
    'tour.error.finish': 'Failed to finish tournament: {msg}',

    // ─── Done view ───────────────────────────────────────────
    'done.title': '🎉 Event complete',
    'done.btn.home': 'Back to home',
    'done.delta.title': 'Points earned',
    'done.delta.row': '+{pts} pts',
    'done.friendly.note': '🤝 This was a friendly event — no points awarded, but win rate (wins / draws / losses) IS updated.',
    'done.friendly.stats': '{played}/{total} friendly matches played · {attendees} attendees',
    'done.friendly.records': 'Records this round',

    // ─── Backup (post-event auto-download + share) ──────────
    'backup.notice.success': 'Backup downloaded automatically. We strongly recommend sending it to yourself (WeChat / email / cloud) so you don\'t lose your data if you switch phones or your browser clears its storage.',
    'backup.notice.failed': '⚠️ Auto-backup failed! Please export manually via "Player Database → Export JSON".',
    'backup.share': '📤 Share backup to chat / email',
    'backup.share.fallback': 'This browser doesn\'t support file sharing — backup was downloaded instead. Share it manually from your Downloads folder.',
    'backup.share.failed': 'Share failed: {msg}',

    // ─── History view ────────────────────────────────────────
    'hist.title': 'History',
    'hist.empty': 'No history yet. Completed events will appear here.',
    'hist.row.summary': '{teams} teams · {players} players · {done}/{total} matches',
    'hist.detail.teams': 'Teams',
    'hist.detail.matches': 'Results',
    'hist.detail.deltas': 'Points earned',
    'hist.detail.no_matches': 'No results',
    'hist.confirm.delete': "Delete this history entry? This won't refund the points already awarded.",
    'hist.result.a_won': '{name} wins',
    'hist.result.b_won': '{name} wins',
    'hist.result.draw': 'Draw',

    // ─── Import / Export ─────────────────────────────────────
    'io.import.confirm': 'Import will overwrite your data:\n  {players} players\n  {history} history entries\n\nContinue?',
    'io.import.success': 'Import successful.',
    'io.import.error': 'Import failed: {msg}',
    'io.read.error': 'Failed to read file.',

    // ─── Copy schedule ───────────────────────────────────────
    'copy.success': '✓ Copied to clipboard. You can now paste it into any chat.',
    'copy.failure': 'Copy failed. Please copy manually.',
    'copy.need_plan': 'Generate a valid plan first.',
    'copy.no_tournament': 'No tournament in progress.',

    // ─── Schedule text (used when building the copyable text) ─
    'text.header': '🏆 MatchMaker Schedule · {date}',
    'text.header.no_date': '🏆 MatchMaker Schedule',
    'text.teams.header': '[TEAMS] {n} total',
    'text.team.line': '· {name}: {players}',
    'text.format.header': '[FORMAT] {fmt}',
    'text.schedule.header': '[SCHEDULE]',
    'text.slot.header': '━━ Slot {n}{time} · {phase} {round} ━━',
    'text.slot.time': ' ({start}-{end})',
    'text.court.line': '  📍 Court {n}: {a} vs {b}',
    'text.friendly.line': '  📍 Court {n}: Friendly (eliminated teams)',
    'text.summary': '{ranked} ranked matches · {slots} slots · ~{min} min',
    'text.expense.line': '💰 Expense: {total} ({share} per person)',

    // ─── Phase labels ────────────────────────────────────────
    'phase.setup': 'setup',
    'phase.teams': 'teams',
    'phase.running': 'running',
    'phase.done': 'done',

    // ─── Knockout placeholder labels ─────────────────────────
    'placeholder.group_rank': 'Group {g} #{r}',
    'placeholder.kr_winner': 'KR{r}-M{m} winner',

    // ─── Misc / names ────────────────────────────────────────
    'team.default.name': 'Team {n}',
    'text.name.separator': ', ',
    'format.not_enough_teams': 'Too few teams',
    'format.need_two_teams': 'Need at least 2 teams',
    'format.out_of_time': 'Not enough time',
    'format.group_too_long': 'Group stage exceeds time budget',
    'format.ko_too_long': 'Knockout stage exceeds time budget',
    'format.groups_not_feasible': 'Not enough time for groups + knockout',
    'form.insufficient_players': 'Need at least {n} players (got {m}).',
  },
};

const SUPPORTED = Object.keys(TRANSLATIONS);
const FALLBACK = 'en-US';

const I18N = {
  lang: FALLBACK,

  supported() {
    return SUPPORTED.slice();
  },

  getLang() {
    return this.lang;
  },

  // Detect language: saved override > browser language > fallback
  detect() {
    try {
      const saved = (typeof localStorage !== 'undefined')
        ? localStorage.getItem(I18N_STORAGE_KEY) : null;
      if (saved && TRANSLATIONS[saved]) return saved;
    } catch (e) { /* localStorage may be blocked */ }

    try {
      const browser = (typeof navigator !== 'undefined' && navigator.language)
        ? navigator.language : FALLBACK;
      if (TRANSLATIONS[browser]) return browser;
      // e.g. 'zh' or 'zh-TW' → 'zh-CN'
      if (browser.toLowerCase().startsWith('zh')) return 'zh-CN';
      if (browser.toLowerCase().startsWith('en')) return 'en-US';
    } catch (e) { /* ignore */ }

    return FALLBACK;
  },

  init() {
    this.lang = this.detect();
    if (typeof document !== 'undefined') {
      this.applyToDOM();
    }
    return this.lang;
  },

  set(lang) {
    if (!TRANSLATIONS[lang]) return false;
    this.lang = lang;
    try {
      localStorage.setItem(I18N_STORAGE_KEY, lang);
    } catch (e) { /* ignore */ }
    if (typeof document !== 'undefined') {
      this.applyToDOM();
    }
    return true;
  },

  t(key, params) {
    const dict = TRANSLATIONS[this.lang] || TRANSLATIONS[FALLBACK];
    let str = dict[key];
    if (str === undefined) str = TRANSLATIONS[FALLBACK][key];
    if (str === undefined) return key;  // last-resort: show the key itself
    if (params) {
      str = str.replace(/\{(\w+)\}/g, (match, name) =>
        params[name] !== undefined ? String(params[name]) : match
      );
    }
    return str;
  },

  applyToDOM() {
    try {
      document.documentElement.lang = this.lang;
      document.title = this.t('app.title');
      // textContent
      document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      // placeholder
      document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = this.t(el.getAttribute('data-i18n-ph'));
      });
      // title attribute
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = this.t(el.getAttribute('data-i18n-title'));
      });
    } catch (e) {
      console.error('i18n applyToDOM failed:', e);
    }
  },
};

// Convenience global for terse calls from app.js
function t(key, params) { return I18N.t(key, params); }

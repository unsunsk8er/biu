/**
 * Chinese-aware query normalization/scoring for cover & metadata matching.
 * Kept dependency-free so it can be unit-tested and shared by providers.
 */

export interface CoverQuery {
  title: string
  artist: string
}

const TRADITIONAL_PAIRS = `
愛爱 時时 間间 說说 話话 記记 憶忆 夢梦 遠远 離离 開开 關关 還还 這这 麼么
風风 雲云 後后 來来 個个 們们 無无 與与 為为 對对 錯错 過过 給给 當当 經经
讓让 願愿 聲声 聽听 見见 覺觉 臉脸 頭头 髮发 發发 長长 門门 問问 陽阳 陰阴
葉叶 範范 傑杰 倫伦 陳陈 鄧邓 張张 劉刘 孫孙 靜静 蘇苏 綠绿 華华 謙谦 榮荣
瀧泷 濃浓 鄉乡 親亲 戀恋 嗎吗 媽妈 爺爷 兒儿 誰谁 斷断 續续 終终 於于 樣样
歡欢 樂乐 憂忧 傷伤 淚泪 紅红 塵尘 煙烟 飛飞 鳥鸟 魚鱼 貓猫 車车 馬马 燈灯
燭烛 藍蓝 黃黄 點点 線线 緣缘 約约 邊边 裡里 裏里 著着 隻只 雙双 別别 帶带
壞坏 舊旧 氣气 溫温 軟软 甜 嘯啸 擱搁 淺浅 傑杰 倫伦 愛爱 葉叶 範范 陳陈 鄧邓 張张 劉刘 孫孙 靜静 蘇苏 綠绿 華华 謙谦 榮荣 瀧泷 徹彻 灑洒 寫写 詩诗 詞词 讀读 書书 畫画
`

const SIMPLIFIED = new Map<string, string>()
for (const pair of TRADITIONAL_PAIRS.trim().split(/\s+/)) {
  if (pair.length >= 2) SIMPLIFIED.set(pair[0], pair.slice(1))
}

export function toSimplified(value: string): string {
  let out = ''
  for (const char of String(value || '')) out += SIMPLIFIED.get(char) || char
  return out
}

const ARTIST_ALIASES: Record<string, string> = {
  '周杰伦': '周杰伦', 'jaychou': '周杰伦', 'jay chou': '周杰伦', 'chou': '周杰伦',
  '林俊杰': '林俊杰', 'jjlin': '林俊杰', 'jj lin': '林俊杰',
  '陈奕迅': '陈奕迅', 'easonchan': '陈奕迅', 'eason chan': '陈奕迅', 'eason': '陈奕迅',
  '邓紫棋': '邓紫棋', 'gem': '邓紫棋', 'g.e.m.': '邓紫棋', 'gloriatang': '邓紫棋',
  '薛之谦': '薛之谦', 'jokerxue': '薛之谦', 'joker xue': '薛之谦',
  '李荣浩': '李荣浩', 'lironghao': '李荣浩', 'ronghaoli': '李荣浩',
  '张学友': '张学友', 'jackycheung': '张学友', 'jacky cheung': '张学友',
  '刘德华': '刘德华', 'andylau': '刘德华', 'andy lau': '刘德华',
  '孙燕姿': '孙燕姿', 'stefaniesun': '孙燕姿', 'stefanie sun': '孙燕姿',
  '梁静茹': '梁静茹', 'fishleong': '梁静茹', 'fish leong': '梁静茹',
  '五月天': '五月天', 'mayday': '五月天',
  '苏打绿': '苏打绿', 'sodagreen': '苏打绿',
  '张惠妹': '张惠妹', 'amei': '张惠妹', 'a-mei': '张惠妹',
  '王菲': '王菲', 'fayewong': '王菲', 'faye wong': '王菲',
  '田馥甄': '田馥甄', 'hebetien': '田馥甄', 'hebe tien': '田馥甄',
  '蔡健雅': '蔡健雅', 'tanyachua': '蔡健雅', 'tanya chua': '蔡健雅',
  '华晨宇': '华晨宇', 'huachenyu': '华晨宇',
  '汪苏泷': '汪苏泷', 'silencewang': '汪苏泷', 'silence wang': '汪苏泷',
  '许嵩': '许嵩', 'vae': '许嵩', 'xusong': '许嵩',
  '毛不易': '毛不易', 'maobuyi': '毛不易',
  '周深': '周深', 'zhoushen': '周深',
  '李健': '李健', 'lijian': '李健',
  '朴树': '朴树', 'pushu': '朴树',
  '赵雷': '赵雷', 'zhaolei': '赵雷',
  '陈粒': '陈粒', 'chenli': '陈粒',
  '张杰': '张杰', 'zhangjie': '张杰',
  '张碧晨': '张碧晨', 'zhangbichen': '张碧晨',
  '邓丽君': '邓丽君', 'teresateng': '邓丽君', 'teresa teng': '邓丽君',
  '那英': '那英', 'naying': '那英',
  '王心凌': '王心凌', 'cyndiwang': '王心凌', 'cyndi wang': '王心凌',
  '张韶涵': '张韶涵', 'angelachang': '张韶涵', 'angela chang': '张韶涵',
  '萧敬腾': '萧敬腾', 'jamhsiao': '萧敬腾', 'jam hsiao': '萧敬腾',
  '林宥嘉': '林宥嘉', 'yogalin': '林宥嘉', 'yoga lin': '林宥嘉',
  '徐佳莹': '徐佳莹', 'lalahsu': '徐佳莹', 'lala hsu': '徐佳莹',
  '杨宗纬': '杨宗纬', 'askayang': '杨宗纬', 'aska yang': '杨宗纬',
  '周传雄': '周传雄', 'stevechou': '周传雄', 'steve chou': '周传雄',
  '任贤齐': '任贤齐', 'richiejen': '任贤齐', 'richie jen': '任贤齐',
  '周华健': '周华健', 'emilchau': '周华健', 'emil chau': '周华健',
  '张信哲': '张信哲', 'jeffchang': '张信哲', 'jeff chang': '张信哲',
  '潘玮柏': '潘玮柏', 'willpan': '潘玮柏', 'will pan': '潘玮柏',
  '萧亚轩': '萧亚轩', 'elvahsiao': '萧亚轩', 'elva hsiao': '萧亚轩',
  '杨千嬅': '杨千嬅', 'miriamyeung': '杨千嬅', 'miriam yeung': '杨千嬅',
  '容祖儿': '容祖儿', 'joeyyung': '容祖儿', 'joey yung': '容祖儿',
  '谢霆锋': '谢霆锋', 'nicholastse': '谢霆锋', 'nicholas tse': '谢霆锋',
  '古巨基': '古巨基', 'leoku': '古巨基', 'leo ku': '古巨基',
  '李克勤': '李克勤', 'hackenlee': '李克勤', 'hacken lee': '李克勤',
  '谭咏麟': '谭咏麟', 'alantam': '谭咏麟', 'alan tam': '谭咏麟',
  '张国荣': '张国荣', 'lesliecheung': '张国荣', 'leslie cheung': '张国荣',
  '梅艳芳': '梅艳芳', 'anitamui': '梅艳芳', 'anita mui': '梅艳芳',
  '罗大佑': '罗大佑', 'luodayou': '罗大佑',
  '李宗盛': '李宗盛', 'jonathanlee': '李宗盛', 'jonathan lee': '李宗盛',
  '汪峰': '汪峰', 'wangfeng': '汪峰',
  '许巍': '许巍', 'xuwei': '许巍',
  '刀郎': '刀郎', 'daolang': '刀郎',
  '凤凰传奇': '凤凰传奇', 'phoenixlegend': '凤凰传奇',
  '告五人': '告五人', 'accusefive': '告五人',
  '房东的猫': '房东的猫',
  '张宇': '张宇', 'zhangyu': '张宇',
  '游鸿明': '游鸿明',
  '齐秦': '齐秦', 'chi Chin': '齐秦',
  '苏芮': '苏芮', 'juliesue': '苏芮',
  '范晓萱': '范晓萱', 'mavis fan': '范晓萱',
  '王杰': '王杰', 'davewang': '王杰', 'dave wang': '王杰',
  '王力宏': '王力宏', 'leehomwang': '王力宏', 'leehom': '王力宏',
  '陶喆': '陶喆', 'davidtao': '陶喆', 'david tao': '陶喆',
  '杨丞琳': '杨丞琳', 'rainieyang': '杨丞琳', 'rainie yang': '杨丞琳',
  '蔡依林': '蔡依林', 'jolintsai': '蔡依林', 'jolin tsai': '蔡依林',

  // Global / multilingual artists. Latin aliases are matched on word boundaries
  // so a name like "Eason" cannot match the word "reason".
  'taylor swift': 'Taylor Swift', 'taylorswift': 'Taylor Swift', '泰勒·斯威夫特': 'Taylor Swift', '泰勒丝': 'Taylor Swift',
  'billie eilish': 'Billie Eilish', 'billieeilish': 'Billie Eilish', '碧梨': 'Billie Eilish',
  'ed sheeran': 'Ed Sheeran', 'edsheeran': 'Ed Sheeran', '艾德·希兰': 'Ed Sheeran',
  'bruno mars': 'Bruno Mars', 'brunomars': 'Bruno Mars', '布鲁诺·马尔斯': 'Bruno Mars',
  'the weeknd': 'The Weeknd', 'theweeknd': 'The Weeknd', '威肯': 'The Weeknd',
  'ariana grande': 'Ariana Grande', 'arianagrande': 'Ariana Grande', '爱莉安娜·格兰德': 'Ariana Grande',
  'dua lipa': 'Dua Lipa', 'dualipa': 'Dua Lipa', '杜阿·利帕': 'Dua Lipa',
  'adele': 'Adele', '阿黛尔': 'Adele',
  'beyonce': 'Beyoncé', 'beyoncé': 'Beyoncé', '碧昂丝': 'Beyoncé',
  'lady gaga': 'Lady Gaga', 'ladygaga': 'Lady Gaga', '嘎嘎小姐': 'Lady Gaga',
  'shakira': 'Shakira', '夏奇拉': 'Shakira',
  'luis fonsi': 'Luis Fonsi', '路易斯·冯西': 'Luis Fonsi',
  'rammstein': 'Rammstein', '德国战车': 'Rammstein',
  'edith piaf': 'Édith Piaf', 'édith piaf': 'Édith Piaf',
  'dmitri shostakovich': 'Dmitri Shostakovich', 'дмитрий шостакович': 'Dmitri Shostakovich',
  'kenshi yonezu': '米津玄師', '米津玄师': '米津玄師', '米津玄師': '米津玄師',
  'hikaru utada': '宇多田ヒカル', '宇多田光': '宇多田ヒカル', '宇多田ヒカル': '宇多田ヒカル',
  'yoasobi': 'YOASOBI', 'ヨアソビ': 'YOASOBI',
  'aimer': 'Aimer', 'エメ': 'Aimer',
  'yorushika': 'Yorushika', 'ヨルシカ': 'Yorushika',
  'fujii kaze': '藤井風', '藤井风': '藤井風', '藤井風': '藤井風',
  'king gnu': 'King Gnu',
  'bts': 'BTS', '방탄소년단': 'BTS',
  'blackpink': 'BLACKPINK', '블랙핑크': 'BLACKPINK',
  'newjeans': 'NewJeans', '뉴진스': 'NewJeans',
  'stray kids': 'Stray Kids', '스트레이 키즈': 'Stray Kids',
  '아이유': 'IU',


}

const KNOWN_ARTISTS = Array.from(new Set(Object.values(ARTIST_ALIASES)))
  .sort((a, b) => b.length - a.length)

const VERSION_WORD_SOURCE = [
  'live', 'remix', 'remaster(?:ed)?', 'acoustic', 'instrumental', 'karaoke',
  'cover', 'demo', 'edit', 'version', 'sped\\s*up', 'slowed', 'nightcore',
  'reverb', '8d', 'official', 'mv', 'video', 'audio', 'lyrics?', 'visualizer',
  'feat\\.?', 'ft\\.?', 'explicit', 'uncensored',
  'en vivo', 'ao vivo', 'en direct', 'dal vivo', 'acústico', 'acustico', 'versión',
  'reprise', 'концерт', 'живой', 'кавер', 'ремикс', 'инструментал', 'مباشر',
  '现场', '演唱会', '翻唱', '伴奏', '纯音乐', '完整版', '高清', '超清', '无损',
  '高音质', '重制', '修复', '动态歌词', '歌词版', '字幕', '中字', '双语',
  'ライブ', 'カバー', 'インスト', 'リミックス', '歌ってみた', '日本語字幕',
  '리메이크', '라이브', '커버', '한글자막', '가사',
].join('|')
const QUALITY_WORD_SOURCE = [
  '4k', '8k', '1080p', '720p', '60fps', 'hdr', 'hi-?res', '无损', '高音质',
  '纯享', '完整版', '现场版', '动态歌词', '歌词版', '中文字幕', '中字',
  '超清', '高清', '重制版', '重制', '修复', '官方', '演唱会', '音乐节',
  '双语字幕', '字幕', '4k修复', '官方', 'mv', 'official', '完整', '中英字幕', '双字',
].join('|')
const VERSION_MARKER_SOURCE = [
  'live', 'remix', 'remaster(?:ed)?', 'acoustic', 'instrumental', 'karaoke',
  'cover', 'demo', 'version', 'first take', 'the first take', 'sped\\s*up', 'slowed', 'nightcore', 'reverb',
  '现场', '演唱会', '翻唱', '伴奏', '纯音乐', 'ライブ', 'カバー', 'インスト',
  'リミックス', '歌ってみた', '리메이크', '라이브', '커버',
  'en vivo', 'ao vivo', 'en direct', 'dal vivo', 'acústico', 'acustico', 'versión',
  'reprise', 'концерт', 'живой', 'кавер', 'ремикс', 'инструментал', 'مباشر',
].join('|')
const VERSION_MARKER_TEST = new RegExp(
  `(?:^|[\\s(\\[【（])(?:${VERSION_MARKER_SOURCE})(?=$|[\\s)\\]】）])`,
  'i',
)
const VERSION_OR_QUALITY_TEST = new RegExp(`(?:${VERSION_WORD_SOURCE}|${QUALITY_WORD_SOURCE})`, 'i')
const QUALITY_GLOBAL = new RegExp(QUALITY_WORD_SOURCE, 'gi')
const TRAILING_VERSION = new RegExp(`(?:\\s*[-–—－|｜:：]\\s*)(?:${VERSION_WORD_SOURCE}|${QUALITY_WORD_SOURCE})\\s*$`, 'i')
const TRAILING_OFFICIAL = /\s+(?:official\s*(?:video|audio|mv|music video)|music video|lyric video)\s*$/i
const UPLOADER_LIKE = /(官方|音乐台|音乐频道|音乐|음악|音楽|ミュージック|музыка|música|musique|musik|mv|频道|up主|哔哩|bilibili|搬运|歌单|电台|精选|翻唱|cover|official|channel|music|studio|制作|vevo|topic|records|entertainment|tv|字幕组|公司)/i

const ALIAS_ENTRIES = Object.entries(ARTIST_ALIASES)
  .map(([alias, canonical]) => [normalizeForMatch(alias), canonical] as const)
  .filter(([alias]) => alias.length >= 3 || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(alias))
  .sort((a, b) => b[0].length - a[0].length)

function foldForMatch(value: string): string {
  return toSimplified(String(value || ''))
    .normalize('NFKC')
    .normalize('NFKD')
    // Strip accents after Latin/Cyrillic/Greek letters, but keep Japanese
    // dakuten/handakuten (び/ぴ) and Arabic harakat are handled below.
    .replace(/([\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}])\p{M}+/gu, '$1')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[’‘`´]/g, "'")
}

function normalizeForMatch(value: string): string {
  let text = foldForMatch(value)
    .replace(/\b(?:feat|ft)\.?\s+.+$/i, ' ')
  // Remove bracketed version/quality annotations only; a title such as
  // "Live Forever" or "Cover Me" must survive intact.
  text = text.replace(/[（(【\u005B]([^）)】\]]{0,100})[）)】\]]/g, (all, inner: string) =>
    VERSION_OR_QUALITY_TEST.test(inner) ? ' ' : all,
  )
  text = text
    .replace(TRAILING_VERSION, ' ')
    .replace(TRAILING_OFFICIAL, ' ')
    .replace(QUALITY_GLOBAL, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

export function normalizeCoverText(value: string): string {
  return normalizeForMatch(value)
}

function compact(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function aliasMatches(spacedText: string, squashedText: string, alias: string): boolean {
  if (!alias) return false
  if (/^[a-z0-9 ]+$/.test(alias)) {
    return new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?=\\s|$)`).test(spacedText)
  }
  return squashedText.includes(alias.replace(/\s+/g, ''))
}

export function extractKnownArtist(value: string): string {
  const spaced = normalizeForMatch(value)
  const squashed = compact(value)
  if (!spaced && !squashed) return ''
  let best = ''
  let bestLength = 0
  for (const [alias, canonical] of ALIAS_ENTRIES) {
    if (aliasMatches(spaced, squashed, alias) && alias.length > bestLength) {
      best = canonical
      bestLength = alias.length
    }
  }
  for (const artist of KNOWN_ARTISTS) {
    const key = normalizeForMatch(artist)
    if (aliasMatches(spaced, squashed, key) && key.length > bestLength) {
      best = artist
      bestLength = key.length
    }
  }
  return best
}

export function isUploaderLike(value: string): boolean {
  const raw = String(value || '').trim()
  if (!raw) return true
  if (extractKnownArtist(raw)) return false
  return raw.length > 40 || UPLOADER_LIKE.test(raw)
}

function cleanTitle(value: string): string {
  // Keep original script for provider search. Traditional/Japanese/Korean
  // characters are folded only for comparison in normalizeForMatch.
  return String(value || '')
    .normalize('NFKC')
    .replace(/【([^】]{0,80})】/g, (_all, inner: string) => VERSION_OR_QUALITY_TEST.test(inner) ? ' ' : ` ${inner} `)
    .replace(/\[([^\]]{0,80})\]/g, (_all, inner: string) => VERSION_OR_QUALITY_TEST.test(inner) ? ' ' : ` ${inner} `)
    .replace(/[（(]([^）)]{0,80})[）)]/g, (_all, inner: string) => VERSION_OR_QUALITY_TEST.test(inner) ? ' ' : ` ${inner} `)
    .replace(/[《「『]([^》」』]*)[》」』]/g, ' $1 ')
    .replace(TRAILING_VERSION, ' ')
    .replace(TRAILING_OFFICIAL, ' ')
    .replace(QUALITY_GLOBAL, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—－·|:：]+|[\s\-–—－·|:：]+$/g, '')
    .trim()
}

function cleanArtist(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(QUALITY_GLOBAL, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—－·|:：]+|[\s\-–—－·|:：]+$/g, '')
    .trim()
}

function stripArtistFromTitle(title: string, artist: string): string {
  const artists = [artist, ...splitArtists(artist)].map(cleanArtist).filter(Boolean)
  let next = title
  for (const name of artists.sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const edge = new RegExp(`^\\s*${escaped}\\s*[-–—－·|:：]\\s*|\\s*[-–—－·|:：]\\s*${escaped}\\s*$`, 'gi')
    const bracket = new RegExp(`[【\\[（(]\\s*${escaped}\\s*[】\\]）)]`, 'gi')
    const prefix = new RegExp(`^\\s*${escaped}\\s+`, 'i')
    const suffix = new RegExp(`\\s+${escaped}\\s*$`, 'i')
    const prefixTight = new RegExp(`^${escaped}`, 'i')
    const suffixTight = new RegExp(`${escaped}$`, 'i')
    next = next
      .replace(edge, ' ')
      .replace(bracket, ' ')
      .replace(prefix, ' ')
      .replace(suffix, ' ')
      .replace(prefixTight, ' ')
      .replace(suffixTight, ' ')
      .trim()
    if (next === name) next = ''
  }
  return next
}

function splitArtists(value: string): string[] {
  return String(value || '')
    .split(/\s*(?:\/|&|、|,|，|;|；|\+|\bwith\b|\bfeat\.?\b|\bft\.?\b|\bvs\.?\b|×|・)\s*/i)
    .map(part => part.trim())
    .filter(Boolean)
}

function artistKeys(value: string): Set<string> {
  const keys = new Set<string>()
  const add = (raw: string) => {
    const normalized = normalizeForMatch(raw)
    const key = normalized.replace(/\s+/g, '')
    if (!key) return
    keys.add(key)
    // "The Weeknd" / "Weeknd" and punctuation differences should meet.
    if (normalized.startsWith('the ')) keys.add(normalized.slice(4).replace(/\s+/g, ''))
    const canonical = ARTIST_ALIASES[key] || ARTIST_ALIASES[normalized]
    if (canonical) {
      const ck = normalizeForMatch(canonical).replace(/\s+/g, '')
      keys.add(ck)
      if (normalizeForMatch(canonical).startsWith('the ')) keys.add(normalizeForMatch(canonical).slice(4).replace(/\s+/g, ''))
    }
    const known = extractKnownArtist(raw)
    if (known) keys.add(normalizeForMatch(known).replace(/\s+/g, ''))
  }
  add(value)
  splitArtists(value).forEach(add)
  return keys
}

export function artistSimilarity(a: string, b: string): number {
  const ka = artistKeys(a)
  const kb = artistKeys(b)
  if (!ka.size || !kb.size) return 0
  for (const x of ka) if (kb.has(x)) return 1
  let best = 0
  for (const x of ka) {
    for (const y of kb) {
      if (x.length >= 2 && y.length >= 2) {
        const bigram = dice(x, y, 2)
        if (bigram > best) best = bigram
      } else if (x === y) best = 1
    }
  }
  return best
}

function dice(a: string, b: string, size: number): number {
  if (!a || !b) return 0
  if (a.length < size || b.length < size) return 0
  const grams = (text: string) => {
    const set = new Set<string>()
    for (let i = 0; i <= text.length - size; i++) set.add(text.slice(i, i + size))
    return set
  }
  const sa = grams(a)
  const sb = grams(b)
  let overlap = 0
  for (const token of sa) if (sb.has(token)) overlap += 1
  return (2 * overlap) / (sa.size + sb.size)
}

export function textSimilarity(a: string, b: string): number {
  const ca = compact(a)
  const cb = compact(b)
  if (!ca || !cb) return 0
  if (ca === cb) return 1
  if (ca.includes(cb) || cb.includes(ca)) return 0.94
  const bigram = dice(ca, cb, 2)
  const unigram = dice(ca, cb, 1)
  if (ca.length >= 3 && cb.length >= 3) return Math.max(bigram, unigram * 0.72)
  return bigram
}

function plausibleArtist(value: string): boolean {
  const artist = cleanArtist(value)
  if (!artist || artist.length > 80 || !/\p{L}/u.test(artist)) return false
  if (isUploaderLike(artist)) return false
  if (VERSION_OR_QUALITY_TEST.test(artist)) return false
  return true
}

function plausibleTitle(value: string): boolean {
  const title = cleanTitle(value)
  return Boolean(title) && /[\p{L}\p{N}]/u.test(title)
}

function titleArtistPairs(rawTitle: string): Array<[string, string]> {
  let text = String(rawTitle || '').normalize('NFKC').trim()
  text = text.replace(/^[【\u005B]([^】\]]{0,40})[】\]]\s*/, '')
  const pairs: Array<[string, string]> = []
  const push = (artist: string, title: string) => {
    if (plausibleArtist(artist) && plausibleTitle(title)) pairs.push([artist, title])
  }
  // "Artist《Title》", "Artist「Title」", "Artist『Title』"
  const book = text.match(/^(.{1,80}?)\s*[《「『](.+?)[》」』]\s*$/)
  if (book) push(book[1], book[2])
  // "Artist - Title", "Artist | Title", "Artist：Title"; the hyphen form
  // requires whitespace to avoid splitting names such as "Twenty-One Pilots".
  const separated = text.match(/^(.{1,80}?)\s*(?:\s[-–—－]\s|\||｜|：|:)\s*(.{1,120})$/)
  if (separated) push(separated[1], separated[2])
  // Spaced slash is a common CJK/global separator; don't split AC/DC.
  const slash = text.match(/^(.{1,80}?)\s+[/／]\s+(.{1,120})$/)
  if (slash) push(slash[1], slash[2])
  return pairs
}

/**
 * Return ordered, deduplicated search variants. The first is the most trusted;
 * the last is a title-only fallback for uploader-style artist fields.
 */
export function inferCoverQueries(rawTitle: string, rawArtist: string): CoverQuery[] {
  const titleRaw = String(rawTitle || '').trim()
  const artistRaw = String(rawArtist || '').trim()
  const baseTitle = cleanTitle(titleRaw)
  if (!baseTitle) return []

  const knownFromArtist = extractKnownArtist(artistRaw)
  const knownFromTitle = extractKnownArtist(titleRaw)
  const uploader = isUploaderLike(artistRaw)
  const variants: CoverQuery[] = []
  const add = (title: string, artist: string) => {
    const clean = { title: cleanTitle(title), artist: cleanArtist(artist) }
    if (!clean.title) return
    const key = `${normalizeForMatch(clean.title)}|${normalizeForMatch(clean.artist)}`
    if (variants.some(item => `${normalizeForMatch(item.title)}|${normalizeForMatch(item.artist)}` === key)) return
    variants.push(clean)
  }

  let fallbackTitle = baseTitle
  if (!uploader && artistRaw) {
    const artist = knownFromArtist || cleanArtist(artistRaw)
    const title = stripArtistFromTitle(baseTitle, artist) || baseTitle
    fallbackTitle = title
    add(title, artist)
  } else if (knownFromArtist || knownFromTitle) {
    const artist = knownFromArtist || knownFromTitle
    const title = stripArtistFromTitle(baseTitle, artist) || baseTitle
    fallbackTitle = title
    add(title, artist)
  }

  // Parse title-embedded artist information. This is essential for non-Chinese
  // videos, where the artist field is often just the uploader/channel name.
  for (const [left, right] of titleArtistPairs(titleRaw)) {
    const leftKey = normalizeForMatch(left)
    const rightKey = normalizeForMatch(right)
    const known = knownFromArtist || knownFromTitle
    const knownKey = normalizeForMatch(known)
    if (known && (leftKey === knownKey || leftKey.includes(knownKey))) {
      add(right, known)
    } else if (known && (rightKey === knownKey || rightKey.includes(knownKey))) {
      add(left, known)
    } else {
      add(right, left)
      add(left, right)
    }
  }

  // Last resort: title only, using the artist-stripped title when available.
  add(fallbackTitle, '')
  return variants.slice(0, 4)
}

export function inferCoverQuery(rawTitle: string, rawArtist: string): CoverQuery {
  return inferCoverQueries(rawTitle, rawArtist)[0] || { title: cleanTitle(rawTitle), artist: '' }
}

function hasVersionMarker(value: string): boolean {
  const text = foldForMatch(value)
  // CJK markers are often embedded in a longer parenthetical description
  // ("2024…第一周现场"), where word-boundary matching cannot see them.
  if (/(?:现场|演唱会|翻唱|伴奏|纯音乐|ライブ|カバー|インスト|リミックス|歌ってみた|리메이크|라이브|커버|en vivo|ao vivo|en direct|dal vivo|acústico|acustico|versión|reprise|концерт|живой|кавер|ремикс|инструментал|مباشر)/.test(text)) return true
  return VERSION_MARKER_TEST.test(text)
}

export function scoreCoverCandidate(query: CoverQuery, candidateTitle: string, candidateArtist: string): number {
  const titleScore = textSimilarity(query.title, candidateTitle)
  const hasArtist = Boolean(normalizeForMatch(query.artist))
  const hasCandidateArtist = Boolean(normalizeForMatch(candidateArtist))
  const artistScore = hasArtist && hasCandidateArtist ? artistSimilarity(query.artist, candidateArtist) : 1
  if (titleScore < 0.3) return 0
  if (hasArtist && hasCandidateArtist && artistScore < 0.2) return 0
  let score = hasArtist
    ? (hasCandidateArtist ? titleScore * 0.7 + artistScore * 0.3 : titleScore * 0.86)
    : titleScore
  if (titleScore >= 0.96 && (!hasArtist || !hasCandidateArtist || artistScore >= 0.7)) score = Math.max(score, 0.96)
  if (hasArtist && hasCandidateArtist && artistScore < 0.45) score *= 0.86
  // Prefer the studio/original release when the query did not explicitly ask
  // for a live/remix/instrumental version.
  if (hasVersionMarker(candidateTitle) && !hasVersionMarker(query.title)) score *= 0.94
  return Math.round(score * 1000) / 1000
}

export function canonicalArtistName(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const known = extractKnownArtist(raw)
  return known || cleanArtist(raw)
}

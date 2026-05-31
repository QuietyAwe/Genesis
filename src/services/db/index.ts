import * as SQLite from 'expo-sqlite';

const DB_NAME = 'genesis.db';
const SEED_KEY = 'genesis_seeded';

// Singleton DB connection — never close on Android
let _db: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    console.log('[Genesis::DB] Opening database...');
    _db = await SQLite.openDatabaseAsync(DB_NAME);
    console.log('[Genesis::DB] Database opened, initializing tables...');
    await initTables(_db);
  }
  return _db;
}

async function initTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      core_setting TEXT DEFAULT '',
      activity_level INTEGER DEFAULT 5,
      world_id TEXT,
      ambient_color TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      lore TEXT DEFAULT '',
      ambient_color TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      world_ids TEXT DEFAULT '[]',
      character_ids TEXT NOT NULL DEFAULT '[]',
      character_snapshots TEXT,
      system_prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      stage_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_avatar TEXT DEFAULT '',
      sender_id TEXT,
      content TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      is_selected INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add world_ids column if it doesn't exist
  try {
    await db.execAsync('ALTER TABLE stages ADD COLUMN world_ids TEXT DEFAULT \'[]\'');
    console.log('[Genesis::DB] Migration: added world_ids column');
  } catch {
    // Column already exists, ignore
  }

  // Migration: add lore_entries_json to worlds
  try {
    await db.execAsync('ALTER TABLE worlds ADD COLUMN lore_entries_json TEXT');
    console.log('[Genesis::DB] Migration: added lore_entries_json column');
  } catch {
    // Column already exists, ignore
  }

  // Migration: add opening_scene and character_statuses_json to stages
  try {
    await db.execAsync('ALTER TABLE stages ADD COLUMN opening_scene TEXT');
    console.log('[Genesis::DB] Migration: added opening_scene column');
  } catch {
    // Column already exists, ignore
  }
  try {
    await db.execAsync('ALTER TABLE stages ADD COLUMN character_statuses_json TEXT');
    console.log('[Genesis::DB] Migration: added character_statuses_json column');
  } catch {
    // Column already exists, ignore
  }

  // Migration: add stage_summary to stages
  try {
    await db.execAsync('ALTER TABLE stages ADD COLUMN stage_summary TEXT');
    console.log('[Genesis::DB] Migration: added stage_summary column');
  } catch {
    // Column already exists, ignore
  }

  console.log('[Genesis::DB] Tables ensured');
}

// Separate seed function — called once from App startup
export async function seedDatabase(): Promise<void> {
  const db = await getDB();

  try {
    const seedCheck = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      SEED_KEY,
    );
    if (seedCheck) {
      console.log('[Genesis::DB] Already seeded, skipping');
      return;
    }
  } catch {
    // settings table might not exist yet — continue with seed
    console.log('[Genesis::DB] Seed check failed, proceeding with seed');
  }

  console.log('[Genesis::DB] Seeding database...');
  const now = Date.now();

  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    SEED_KEY,
    'true',
  );

  const seedChars = [
    {
      id: 'seed_1',
      name: '西尔维娅',
      avatar: '🦊',
      coreSetting: '冷静、敏锐、言辞锋利但内心柔软。习惯用讽刺掩饰关心。雾港最年轻的情报商，左眼能看见影子中的真相。口癖：「……别误会，我只是不想我的货物受损。」',
      activity_level: 8,
      ambient_color: '#EDEAE5',
    },
    {
      id: 'seed_2',
      name: '迦尔纳',
      avatar: '🔥',
      coreSetting: '豪迈、冲动、重义气。行动永远快于思考，但在关键时刻出奇地可靠。烬土移动堡垒"赤驹号"的前任领航员，因违抗命令放走难民被逐出队伍。口癖：「哈哈哈，天塌下来也得先吃饱饭！」',
      activity_level: 7,
      ambient_color: '#F0EBE3',
    },
    {
      id: 'seed_3',
      name: '露娜',
      avatar: '🌙',
      coreSetting: '温柔、神秘、略带慵懒。说话像是在吟唱，偶尔会抛出让人猜不透的暗示。自称"月光图书馆"的管理员，掌握着跨越时空的知识。口癖：「月亮知道答案哦……可惜它从不说话。」',
      activity_level: 6,
      ambient_color: '#E8E4F0',
    },
  ];

  for (const c of seedChars) {
    await db.runAsync(
      'INSERT OR IGNORE INTO characters (id, name, avatar, core_setting, activity_level, world_id, ambient_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      c.id,
      c.name,
      c.avatar,
      c.coreSetting,
      c.activity_level,
      '',
      c.ambient_color,
      now,
      now,
    );
  }

  await db.runAsync(
    'INSERT OR IGNORE INTO worlds (id, name, emoji, lore, ambient_color, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    'seed_w1',
    '雾港',
    '🌫️',
    '一座被永雾笼罩的港口城市。十七世纪的大帆船仍然在雾中航行，城中居民半是人半是影子。传闻每逢退雾，海底的古城就会浮出水面。',
    '#EDEAE5',
    now,
  );

  console.log('[Genesis::DB] Seeding complete');
}

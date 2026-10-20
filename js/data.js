// Static content for the prototype: institutions, activities, room items, mock people.
(function (root) {
  'use strict';

  const SCHOOLS = [
    { id: 'triam', name: 'โรงเรียนเตรียมอุดมศึกษา', type: 'school' },
    { id: 'suankularb', name: 'โรงเรียนสวนกุหลาบวิทยาลัย', type: 'school' },
    { id: 'satri', name: 'โรงเรียนสตรีวิทยา', type: 'school' },
    { id: 'bodin', name: 'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)', type: 'school' },
    { id: 'yupparaj', name: 'โรงเรียนยุพราชวิทยาลัย', type: 'school' },
    { id: 'chula', name: 'จุฬาลงกรณ์มหาวิทยาลัย', type: 'uni' },
    { id: 'tu', name: 'มหาวิทยาลัยธรรมศาสตร์', type: 'uni' },
    { id: 'ku', name: 'มหาวิทยาลัยเกษตรศาสตร์', type: 'uni' },
    { id: 'mahidol', name: 'มหาวิทยาลัยมหิดล', type: 'uni' },
    { id: 'cmu', name: 'มหาวิทยาลัยเชียงใหม่', type: 'uni' },
    { id: 'kku', name: 'มหาวิทยาลัยขอนแก่น', type: 'uni' },
    { id: 'other', name: 'อื่นๆ (พิมพ์ชื่อเอง)', type: 'school' },
  ];

  const ACTIVITIES = [
    { id: 'walk', name: 'เดิน/วิ่ง', emoji: '🏃' },
    { id: 'badminton', name: 'แบดมินตัน', emoji: '🏸' },
    { id: 'tennis', name: 'เทนนิส', emoji: '🎾' },
    { id: 'pingpong', name: 'ปิงปอง', emoji: '🏓' },
    { id: 'dance', name: 'เต้น', emoji: '💃' },
    { id: 'yoga', name: 'โยคะ/ยืดเหยียด', emoji: '🧘' },
    { id: 'home', name: 'บอดี้เวทที่บ้าน', emoji: '🏠' },
    { id: 'football', name: 'ฟุตบอล', emoji: '⚽' },
    { id: 'basketball', name: 'บาสเกตบอล', emoji: '🏀' },
    { id: 'swim', name: 'ว่ายน้ำ', emoji: '🏊' },
    { id: 'bike', name: 'ปั่นจักรยาน', emoji: '🚲' },
  ];

  const AVATARS = ['🐻', '🐰', '🐱', '🐶', '🐼', '🦊', '🐸', '🐧', '🐹', '🐨'];

  const LEVELS = [
    { id: 'new', name: 'เพิ่งเริ่ม / ยังไม่ค่อยได้ขยับ' },
    { id: 'some', name: 'ขยับบ้างเป็นบางวัน' },
    { id: 'regular', name: 'ขยับค่อนข้างสม่ำเสมอ' },
  ];

  const FREE_TIMES = [
    { id: 'morning', name: 'เช้าก่อนเข้าเรียน' },
    { id: 'evening', name: 'หลังเลิกเรียน' },
    { id: 'night', name: 'ค่ำๆ ก่อนนอน' },
  ];

  const MOODS = [
    { id: 'great', emoji: '😄', name: 'สดชื่นมาก' },
    { id: 'good', emoji: '🙂', name: 'ดีขึ้นนะ' },
    { id: 'calm', emoji: '😌', name: 'ผ่อนคลาย' },
    { id: 'tired', emoji: '😮‍💨', name: 'เหนื่อยแต่ภูมิใจ' },
  ];

  // x/y are % positions inside the room; theme items recolour wall and floor.
  const ITEMS = [
    { id: 'plant', name: 'ต้นไม้จิ๋ว', emoji: '🪴', cost: 20, x: 8, y: 52, size: 2.6 },
    { id: 'sofa', name: 'โซฟานุ่มนิ่ม', emoji: '🛋️', cost: 40, x: 60, y: 60, size: 3.2 },
    { id: 'poster', name: 'โปสเตอร์ไอดอล', emoji: '🖼️', cost: 30, x: 20, y: 14, size: 2.6 },
    { id: 'window', name: 'หน้าต่างวิวเมือง', emoji: '🪟', cost: 35, x: 58, y: 10, size: 3 },
    { id: 'cat', name: 'น้องแมว', emoji: '🐈', cost: 60, x: 26, y: 74, size: 2.6 },
    { id: 'dog', name: 'น้องหมา', emoji: '🐕', cost: 60, x: 76, y: 76, size: 2.6 },
    { id: 'books', name: 'ชั้นหนังสือ', emoji: '📚', cost: 25, x: 84, y: 44, size: 2.4 },
    { id: 'racket', name: 'ไม้แบดคู่ใจ', emoji: '🏸', cost: 30, x: 86, y: 18, size: 2.2 },
    { id: 'speaker', name: 'ลำโพงเปิดเพลงเต้น', emoji: '📻', cost: 30, x: 6, y: 78, size: 2.2 },
    { id: 'star', name: 'ไฟประดับดาว', emoji: '✨', cost: 0, x: 40, y: 6, size: 2.2, unlock: { streak: 3 } },
    { id: 'trophy', name: 'ถ้วยรางวัล 7 วัน', emoji: '🏆', cost: 0, x: 30, y: 46, size: 2.4, unlock: { streak: 7 } },
    { id: 'theme-mint', name: 'ธีมมิ้นต์', emoji: '🎨', cost: 50, theme: { wall: '#d8f3ea', floor: '#b6e3d4' } },
    { id: 'theme-peach', name: 'ธีมพีช', emoji: '🎨', cost: 50, theme: { wall: '#ffe5d6', floor: '#f6c9b3' } },
    { id: 'theme-night', name: 'ธีมกลางคืน', emoji: '🌙', cost: 70, theme: { wall: '#3c3f73', floor: '#2b2d55' } },
    // Season 1 exclusives: only obtainable from the Battle Pass, never sold in the shop.
    { id: 's1-balloon', name: 'ลูกโป่งซีซั่น 1', emoji: '🎈', season: 1, x: 12, y: 30, size: 2.2 },
    { id: 's1-rainbow', name: 'สายรุ้งติดผนัง', emoji: '🌈', season: 1, x: 74, y: 32, size: 2.4 },
    { id: 's1-teddy', name: 'ตุ๊กตาหมีนุ่ม', emoji: '🧸', season: 1, x: 92, y: 64, size: 2.2 },
    { id: 's1-cloud', name: 'เมฆลอยได้', emoji: '☁️', season: 1, x: 26, y: 4, size: 2.2 },
    { id: 's1-chime', name: 'กระดิ่งลม', emoji: '🎐', season: 1, x: 50, y: 4, size: 2 },
    { id: 's1-sakura', name: 'ธีมซากุระ', emoji: '🌸', season: 1, theme: { wall: '#ffe4ef', floor: '#f7c6d9' } },
  ];

  const ACCESSORIES = [
    { id: 'none', name: 'ไม่ใส่', emoji: '', cost: 0 },
    { id: 'cap', name: 'หมวกแก๊ป', emoji: '🧢', cost: 30 },
    { id: 'ribbon', name: 'โบว์', emoji: '🎀', cost: 30 },
    { id: 'headphones', name: 'หูฟัง', emoji: '🎧', cost: 45 },
    { id: 'crown', name: 'มงกุฎ (streak 7)', emoji: '👑', cost: 0, unlock: { streak: 7 } },
    { id: 's1-star', name: 'กิ๊บดาว', emoji: '⭐', season: 1 },
    { id: 's1-flower', name: 'ดอกไม้ทัดหู', emoji: '🌼', season: 1 },
    { id: 's1-bouquet', name: 'ช่อดอกไม้ซีซั่น 1', emoji: '💐', season: 1 },
  ];

  // Battle Pass rewards per tier (index 0 = tier 1). Cosmetics, coins and card packs only — no XP shortcuts.
  const PASS_FREE = [
    { coins: 20 }, { pack: 1 }, { coins: 30 }, { item: 's1-balloon' }, { pack: 1 }, { coins: 40 },
    { item: 's1-star' }, { pack: 1 }, { coins: 50 }, { item: 's1-rainbow' }, { pack: 1 }, { coins: 80 },
  ];
  const PASS_PREMIUM = [
    { item: 's1-flower' }, { pack: 1 }, { item: 's1-teddy' }, { coins: 40 }, { item: 's1-sakura' }, { pack: 1 },
    { item: 's1-cloud' }, { coins: 60 }, { pack: 1 }, { item: 's1-chime' }, { pack: 2 }, { item: 's1-bouquet' },
  ];
  const PASS_PRICES = [59, 99]; // price test: each tester sees one, assigned at random

  // Milestone cards: earned once, never traded. `need` is checked against player stats.
  const ACHIEVEMENTS = [
    { id: 'ach-first', name: 'ก้าวแรก', emoji: '🌱', rarity: 'common', desc: 'เช็คอินครั้งแรก', need: { total: 1 } },
    { id: 'ach-small', name: 'ก้าวเล็กๆ ก็นับ', emoji: '🐢', rarity: 'common', desc: 'เช็คอินแบบ “ได้นิดหน่อย”', need: { partial: 1 } },
    { id: 'ach-streak3', name: '3 วันติด', emoji: '🔥', rarity: 'common', desc: 'streak 3 วัน', need: { bestStreak: 3 } },
    { id: 'ach-streak7', name: 'ครบสัปดาห์', emoji: '⭐', rarity: 'rare', desc: 'streak 7 วัน', need: { bestStreak: 7 } },
    { id: 'ach-streak14', name: '2 สัปดาห์ไม่ถอย', emoji: '💎', rarity: 'epic', desc: 'streak 14 วัน', need: { bestStreak: 14 } },
    { id: 'ach-total10', name: '10 วันที่ขยับ', emoji: '🎯', rarity: 'rare', desc: 'เช็คอินรวม 10 วัน', need: { total: 10 } },
    { id: 'ach-total30', name: '30 วันแห่งความสม่ำเสมอ', emoji: '🏅', rarity: 'epic', desc: 'เช็คอินรวม 30 วัน', need: { total: 30 } },
    { id: 'ach-rest', name: 'พักได้ไม่ผิด', emoji: '❄️', rarity: 'common', desc: 'ใช้ Streak Freeze ครั้งแรก', need: { freezeUsed: 1 } },
    { id: 'ach-explorer', name: 'นักลองของ', emoji: '🧭', rarity: 'rare', desc: 'ลองกิจกรรม 3 แบบ', need: { activities: 3 } },
    { id: 'ach-group', name: 'มีแก๊งแล้ว', emoji: '👯', rarity: 'common', desc: 'เข้ากลุ่มเพื่อนสนิท', need: { group: 1 } },
    { id: 'ach-buddy', name: 'เจอบัดดี้', emoji: '🫶', rarity: 'common', desc: 'เริ่มลองคุยกับบัดดี้', need: { buddy: 1 } },
    { id: 'ach-cheer', name: 'สายเชียร์', emoji: '📣', rarity: 'rare', desc: 'ส่งกำลังใจ 5 ครั้ง', need: { cheers: 5 } },
    { id: 'ach-brave', name: 'กล้าเปิดตัว', emoji: '🌷', rarity: 'rare', desc: 'ให้เพื่อนเห็นมินิรูมครั้งแรก', need: { revealed: 1 } },
  ];

  // Photocards come from packs; duplicates can be traded with friends.
  const PHOTOCARDS = [
    { id: 'pc-dog-run', name: 'วิ่งเช้ากับน้องหมา', emoji: '🐶🏃', rarity: 'common' },
    { id: 'pc-cat-yoga', name: 'ยืดเหยียดกับน้องแมว', emoji: '🐱🧘', rarity: 'common' },
    { id: 'pc-bunny-dance', name: 'เต้นกับกระต่าย', emoji: '🐰💃', rarity: 'common' },
    { id: 'pc-penguin-bike', name: 'ปั่นกับเพนกวิน', emoji: '🐧🚲', rarity: 'common' },
    { id: 'pc-frog-swim', name: 'ว่ายน้ำกับกบ', emoji: '🐸🏊', rarity: 'common' },
    { id: 'pc-bear-ball', name: 'เตะบอลกับหมี', emoji: '🐻⚽', rarity: 'common' },
    { id: 'pc-fox-badminton', name: 'ตีแบดกับฟ็อกซ์', emoji: '🦊🏸', rarity: 'rare' },
    { id: 'pc-panda-tennis', name: 'เทนนิสกับแพนด้า', emoji: '🐼🎾', rarity: 'rare' },
    { id: 'pc-hamster-hoop', name: 'ชู้ตบาสกับแฮมสเตอร์', emoji: '🐹🏀', rarity: 'rare' },
    { id: 'pc-koala-pingpong', name: 'ปิงปองกับโคอาล่า', emoji: '🐨🏓', rarity: 'rare' },
    { id: 'pc-allstar', name: 'ทีมรวมดาว', emoji: '🏆✨', rarity: 'epic' },
    { id: 'pc-sakura', name: 'ซากุระ Season 1', emoji: '🌸🎀', rarity: 'epic' },
  ];

  const RARITY = { common: 'ธรรมดา', rare: 'หายาก', epic: 'ลิมิเต็ด' };

  // Simulated users so groups, buddies and room visits work without a backend.
  const PEOPLE = [
    { name: 'มิ้นท์', avatar: '🐰', level: 'new', freeTime: 'evening', interests: ['dance', 'yoga'], rate: 0.7, items: ['plant', 'poster', 'cat'] },
    { name: 'ภูมิ', avatar: '🐻', level: 'some', freeTime: 'evening', interests: ['badminton', 'football'], rate: 0.75, items: ['racket', 'books', 'window'] },
    { name: 'ใบเตย', avatar: '🐸', level: 'new', freeTime: 'night', interests: ['yoga', 'home'], rate: 0.6, items: ['plant', 'sofa', 'star'] },
    { name: 'ต้นกล้า', avatar: '🐶', level: 'regular', freeTime: 'morning', interests: ['walk', 'bike'], rate: 0.85, items: ['dog', 'window', 'trophy'] },
    { name: 'แพรว', avatar: '🐱', level: 'some', freeTime: 'evening', interests: ['tennis', 'dance'], rate: 0.65, items: ['poster', 'speaker', 'cat'] },
    { name: 'ไอซ์', avatar: '🐧', level: 'new', freeTime: 'morning', interests: ['swim', 'walk'], rate: 0.55, items: ['books', 'plant'] },
    { name: 'ฟ้า', avatar: '🦊', level: 'regular', freeTime: 'night', interests: ['badminton', 'pingpong'], rate: 0.8, items: ['racket', 'sofa', 'star'] },
    { name: 'น้ำหวาน', avatar: '🐹', level: 'some', freeTime: 'night', interests: ['dance', 'home'], rate: 0.7, items: ['speaker', 'plant', 'window'] },
  ];

  const CHEERS = ['สู้ๆ นะ 💪', 'ภูมิใจในตัวเธอ ✨', 'พักได้นะ ไม่เป็นไร 💛', 'พรุ่งนี้ไปด้วยกัน! 🏸', 'เก่งมากกก 🎉'];

  const ENCOURAGEMENTS = [
    'วันนี้ขยับแล้ว เก่งมาก! ✨',
    'ร่างกายขอบคุณเธอนะ 💛',
    'ความสม่ำเสมอชนะทุกอย่าง 🌱',
    'ทีละนิดก็คือการไปต่อ 🐢',
    'เพื่อนๆ ต้องภูมิใจแน่เลย 🎉',
  ];

  const EXIT_REASONS = [
    'ช่วงสอบ / การบ้านเยอะ',
    'ไม่ค่อยสบาย',
    'เบื่อ ไม่สนุกแล้ว',
    'ไม่มีเพื่อนทำด้วย',
    'ลืมเปิดแอป',
    'อื่นๆ',
  ];

  const api = {
    SCHOOLS, ACTIVITIES, AVATARS, LEVELS, FREE_TIMES, MOODS, ITEMS, ACCESSORIES, PEOPLE, CHEERS, ENCOURAGEMENTS, EXIT_REASONS,
    PASS_FREE, PASS_PREMIUM, PASS_PRICES, ACHIEVEMENTS, PHOTOCARDS, RARITY,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Data = api;
})(this);

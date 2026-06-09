-- Lookup table: canonical marker definitions
create table blood_test_markers (
  key text primary key,
  display_name text not null,
  panel text not null,
  sort_order int not null
);

-- One row per test session (a single blood draw)
create table blood_test_sessions (
  id uuid primary key default gen_random_uuid(),
  sampled_at date not null,
  provider text not null default 'Thriva',
  notes text,
  created_at timestamptz default now()
);

-- One row per marker per session
create table blood_test_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references blood_test_sessions(id) on delete cascade,
  marker_key text not null references blood_test_markers(key),
  value_raw text not null,           -- original string e.g. "<0.15", ">90.0", "88.0"
  value_numeric float,               -- parsed float, strip < > prefix; null if unparseable
  value_prefix text,                 -- "<" or ">" if present, else null
  ref_min float,
  ref_max float,
  ref_direction text not null default 'between', -- 'between' | 'above' | 'below'
  unit text not null,
  unique(session_id, marker_key)
);

-- Seed markers
insert into blood_test_markers (key, display_name, panel, sort_order) values
  ('hba1c',             'HbA1c',                              'Metabolic',            1),
  ('crp_hs',            'CRP (high sensitivity)',              'Metabolic',            2),
  ('creatinine',        'Creatinine',                         'Metabolic',            3),
  ('egfr',              'eGFR',                               'Metabolic',            4),
  ('cholesterol',       'Cholesterol',                        'Lipids',               5),
  ('triglycerides',     'Triglycerides',                      'Lipids',               6),
  ('hdl_cholesterol',   'HDL Cholesterol',                    'Lipids',               7),
  ('ldl_cholesterol',   'LDL Cholesterol',                    'Lipids',               8),
  ('non_hdl_cholesterol','Non-HDL Cholesterol',               'Lipids',               9),
  ('tc_hdl_ratio',      'Total Cholesterol/HDL Ratio',        'Lipids',               10),
  ('tg_hdl_ratio',      'Triglyceride/HDL Ratio',             'Lipids',               11),
  ('tsh',               'TSH',                                'Thyroid',              12),
  ('ft4',               'Free Thyroxine (FT4)',               'Thyroid',              13),
  ('active_b12',        'Active B12',                         'Vitamins & Nutrients', 14),
  ('total_b12',         'Total B12',                          'Vitamins & Nutrients', 15),
  ('vitamin_d',         'Vitamin D',                          'Vitamins & Nutrients', 16),
  ('total_protein',     'Total Protein',                      'Vitamins & Nutrients', 17),
  ('albumin',           'Albumin',                            'Vitamins & Nutrients', 18),
  ('globulin',          'Globulin',                           'Vitamins & Nutrients', 19),
  ('alt',               'Alanine Transferase (ALT)',          'Liver',                20),
  ('alp',               'Alkaline Phosphatase (ALP)',         'Liver',                21),
  ('gamma_gt',          'Gamma-GT',                           'Liver',                22),
  ('bilirubin',         'Bilirubin',                          'Liver',                23),
  ('shbg',              'SHBG',                               'Hormones',             24),
  ('testosterone',      'Testosterone',                       'Hormones',             25),
  ('free_androgen_index','Free Androgen Index',               'Hormones',             26),
  ('free_testosterone', 'Free Testosterone',                  'Hormones',             27);

-- Seed session 1: 2025-08-08
insert into blood_test_sessions (id, sampled_at, provider) values
  ('a1000000-0000-0000-0000-000000000001', '2025-08-08', 'Thriva');

insert into blood_test_results (session_id, marker_key, value_raw, value_numeric, value_prefix, ref_min, ref_max, ref_direction, unit) values
  ('a1000000-0000-0000-0000-000000000001','hba1c',              '32.0',   32.0,  null,  0,       41.9999, 'between', 'mMol/Mol'),
  ('a1000000-0000-0000-0000-000000000001','crp_hs',             '<0.15',  0.15,  '<',   0,       3.0,     'between', 'mg/L'),
  ('a1000000-0000-0000-0000-000000000001','creatinine',         '93.0',   93.0,  null,  60,      120,     'between', 'umol/L'),
  ('a1000000-0000-0000-0000-000000000001','egfr',               '>90.0',  90.0,  '>',   90,      null,    'above',   'ml/min/1.73m2'),
  ('a1000000-0000-0000-0000-000000000001','cholesterol',        '4.6',    4.6,   null,  0,       4.9999,  'between', 'mmol/L'),
  ('a1000000-0000-0000-0000-000000000001','triglycerides',      '1.8',    1.8,   null,  0.45,    1.8,     'between', 'mmol/L'),
  ('a1000000-0000-0000-0000-000000000001','hdl_cholesterol',    '1.2',    1.2,   null,  1.0001,  2.3,     'between', 'mmol/L'),
  ('a1000000-0000-0000-0000-000000000001','ldl_cholesterol',    '2.5',    2.5,   null,  0,       2.9999,  'between', 'mmol/L'),
  ('a1000000-0000-0000-0000-000000000001','non_hdl_cholesterol','3.3',    3.3,   null,  0,       4.0,     'between', 'mmol/L'),
  ('a1000000-0000-0000-0000-000000000001','tc_hdl_ratio',       '3.7',    3.7,   null,  0,       4.0,     'between', 'Ratio'),
  ('a1000000-0000-0000-0000-000000000001','tg_hdl_ratio',       '1.4',    1.4,   null,  0,       1.75,    'between', 'Ratio'),
  ('a1000000-0000-0000-0000-000000000001','tsh',                '2.0',    2.0,   null,  0.27,    4.2,     'between', 'mIU/L'),
  ('a1000000-0000-0000-0000-000000000001','ft4',                '18.1',   18.1,  null,  12,      22,      'between', 'pmol/L'),
  ('a1000000-0000-0000-0000-000000000001','active_b12',         '110.0',  110.0, null,  70.0001, 150,     'between', 'pmol/L'),
  ('a1000000-0000-0000-0000-000000000001','total_b12',          '314.0',  314.0, null,  258.0001,569,     'between', 'pmol/L'),
  ('a1000000-0000-0000-0000-000000000001','vitamin_d',          '78.0',   78.0,  null,  50,      250,     'between', 'nmol/L'),
  ('a1000000-0000-0000-0000-000000000001','total_protein',      '68.0',   68.0,  null,  60,      80,      'between', 'g/L'),
  ('a1000000-0000-0000-0000-000000000001','albumin',            '47.0',   47.0,  null,  35,      50,      'between', 'g/L'),
  ('a1000000-0000-0000-0000-000000000001','globulin',           '21.0',   21.0,  null,  19,      35,      'between', 'g/L'),
  ('a1000000-0000-0000-0000-000000000001','alt',                '34.0',   34.0,  null,  0,       45,      'between', 'U/L'),
  ('a1000000-0000-0000-0000-000000000001','alp',                '83.0',   83.0,  null,  30,      130,     'between', 'U/L'),
  ('a1000000-0000-0000-0000-000000000001','gamma_gt',           '22.0',   22.0,  null,  0,       54.9999, 'between', 'U/L'),
  ('a1000000-0000-0000-0000-000000000001','bilirubin',          '5.0',    5.0,   null,  0,       20.9999, 'between', 'umol/L'),
  ('a1000000-0000-0000-0000-000000000001','shbg',               '31.4',   31.4,  null,  18.3,    54.1,    'between', 'nmol/L'),
  ('a1000000-0000-0000-0000-000000000001','testosterone',       '19.9',   19.9,  null,  8.64,    29,      'between', 'nmol/L'),
  ('a1000000-0000-0000-0000-000000000001','free_androgen_index','63.4',   63.4,  null,  35,      92.6,    'between', '%'),
  ('a1000000-0000-0000-0000-000000000001','free_testosterone',  '0.419',  0.419, null,  0.198,   0.619,   'between', 'nmol/L');

-- Seed session 2: 2026-01-23
insert into blood_test_sessions (id, sampled_at, provider) values
  ('a2000000-0000-0000-0000-000000000002', '2026-01-23', 'Thriva');

insert into blood_test_results (session_id, marker_key, value_raw, value_numeric, value_prefix, ref_min, ref_max, ref_direction, unit) values
  ('a2000000-0000-0000-0000-000000000002','hba1c',              '29.0',   29.0,  null,  0,       41.9999, 'between', 'mMol/Mol'),
  ('a2000000-0000-0000-0000-000000000002','crp_hs',             '<0.15',  0.15,  '<',   0,       3.0,     'between', 'mg/L'),
  ('a2000000-0000-0000-0000-000000000002','creatinine',         '101.0',  101.0, null,  60,      120,     'between', 'umol/L'),
  ('a2000000-0000-0000-0000-000000000002','egfr',               '88.0',   88.0,  null,  90,      null,    'above',   'ml/min/1.73m2'),
  ('a2000000-0000-0000-0000-000000000002','cholesterol',        '4.1',    4.1,   null,  0,       4.9999,  'between', 'mmol/L'),
  ('a2000000-0000-0000-0000-000000000002','triglycerides',      '0.9',    0.9,   null,  0.45,    1.8,     'between', 'mmol/L'),
  ('a2000000-0000-0000-0000-000000000002','hdl_cholesterol',    '1.2',    1.2,   null,  1.0001,  2.3,     'between', 'mmol/L'),
  ('a2000000-0000-0000-0000-000000000002','ldl_cholesterol',    '2.5',    2.5,   null,  0,       2.9999,  'between', 'mmol/L'),
  ('a2000000-0000-0000-0000-000000000002','non_hdl_cholesterol','2.9',    2.9,   null,  0,       4.0,     'between', 'mmol/L'),
  ('a2000000-0000-0000-0000-000000000002','tc_hdl_ratio',       '3.4',    3.4,   null,  0,       4.0,     'between', 'Ratio'),
  ('a2000000-0000-0000-0000-000000000002','tg_hdl_ratio',       '0.7',    0.7,   null,  0,       1.75,    'between', 'Ratio'),
  ('a2000000-0000-0000-0000-000000000002','tsh',                '1.53',   1.53,  null,  0.27,    4.2,     'between', 'mIU/L'),
  ('a2000000-0000-0000-0000-000000000002','ft4',                '18.4',   18.4,  null,  12,      22,      'between', 'pmol/L'),
  ('a2000000-0000-0000-0000-000000000002','active_b12',         '142.0',  142.0, null,  70.0001, 150,     'between', 'pmol/L'),
  ('a2000000-0000-0000-0000-000000000002','total_b12',          '450.0',  450.0, null,  258.0001,569,     'between', 'pmol/L'),
  ('a2000000-0000-0000-0000-000000000002','vitamin_d',          '105.0',  105.0, null,  50,      250,     'between', 'nmol/L'),
  ('a2000000-0000-0000-0000-000000000002','total_protein',      '67.0',   67.0,  null,  60,      80,      'between', 'g/L'),
  ('a2000000-0000-0000-0000-000000000002','albumin',            '46.0',   46.0,  null,  35,      50,      'between', 'g/L'),
  ('a2000000-0000-0000-0000-000000000002','globulin',           '20.0',   20.0,  null,  19,      35,      'between', 'g/L'),
  ('a2000000-0000-0000-0000-000000000002','alt',                '41.0',   41.0,  null,  0,       45,      'between', 'U/L'),
  ('a2000000-0000-0000-0000-000000000002','alp',                '81.0',   81.0,  null,  30,      130,     'between', 'U/L'),
  ('a2000000-0000-0000-0000-000000000002','gamma_gt',           '18.0',   18.0,  null,  0,       54.9999, 'between', 'U/L'),
  ('a2000000-0000-0000-0000-000000000002','bilirubin',          '12.0',   12.0,  null,  0,       20.9999, 'between', 'umol/L'),
  ('a2000000-0000-0000-0000-000000000002','shbg',               '28.8',   28.8,  null,  18.3,    54.1,    'between', 'nmol/L'),
  ('a2000000-0000-0000-0000-000000000002','testosterone',       '19.8',   19.8,  null,  8.64,    29,      'between', 'nmol/L'),
  ('a2000000-0000-0000-0000-000000000002','free_androgen_index','68.8',   68.8,  null,  35,      92.6,    'between', '%'),
  ('a2000000-0000-0000-0000-000000000002','free_testosterone',  '0.439',  0.439, null,  0.198,   0.619,   'between', 'nmol/L');

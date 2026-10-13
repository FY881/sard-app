// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import m0000 from './20251222152612_past_mandrill/migration.sql';
import m0001 from './20260612232322_normal_saracen/migration.sql';
import m0002 from './20260719143427_long_moondragon/migration.sql';
import m0003 from './20260727081855_calm_chimera/migration.sql';
import m0004 from './20260811071655_parched_human_torch/migration.sql';
import m0005 from './20261011140000_sard_ai_agents/migration.sql';
import m0006 from './20261011150000_sard_reader/migration.sql';
import m0007 from './20261013120000_sard_plus/migration.sql';

export default {
  migrations: {
    '20251222152612_past_mandrill': m0000,
    '20260612232322_normal_saracen': m0001,
    '20260719143427_long_moondragon': m0002,
    '20260727081855_calm_chimera': m0003,
    '20260811071655_parched_human_torch': m0004,
    '20261011140000_sard_ai_agents': m0005,
    '20261011150000_sard_reader': m0006,
    '20261013120000_sard_plus': m0007,
  },
};

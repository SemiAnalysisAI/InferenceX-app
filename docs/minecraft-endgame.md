# Minecraft endgame

The optional Minecraft game now has a survival completion route. It remains an
independent browser implementation, with simplified terrain and combat rather
than complete Java/Bedrock parity.

## Playing

- Build an obsidian portal with an empty interior at least two blocks wide and
  three blocks high. Ignite the inside with flint and steel. Stand in it for
  three seconds in survival; creative travel is immediate.
- Explore the Nether cavern. Nether-brick fortress bridges cross near X/Z 64
  and repeat every 128 blocks. Blazes spawn on those bridges; endermen spawn on
  nearby ground. Defeat them for blaze rods and ender pearls.
- Craft six rods into twelve blaze powder, then combine powder with twelve
  pearls to make twelve Eyes of Ender. Difficulty must be Easy, Normal or Hard
  for the survival mob drops. Return through the linked portal.
- Use an eye in the Overworld to locate the underground stronghold. The eye
  moves toward it, and chat reports its coordinates. Fill all twelve frames to
  open the End portal.
- Destroy the ten healing crystals on the obsidian pillars. Attack the dragon
  with arrows, or use melee while it descends to the central fountain. The
  dragon circles, perches, charges and shoots damaging projectiles.
- Defeating the dragon awards experience and opens the central return portal.
  Enter it to see the ending and return to your Overworld spawn. Continue
  playing afterward.

The pause menu includes this route in English and Simplified Chinese. Bows use
sticks and string; wool can be converted to string in this edition. Arrows use
flint, sticks and feathers. Eyes are recoverable rather than randomly breaking.
Fortresses are repeating bridge structures, not the complete vanilla structure
set. Outer End islands, End cities, elytra, respawn rituals and the vanilla End
poem are not implemented.

## Save and runtime boundaries

Save version 2 stores the active dimension plus inactive dimension snapshots,
container contents, dropped items, mobs, dragon health, surviving crystals and
completion flags. Version 1 loads as an Overworld save. The inventory and player
remain shared across dimensions. Death in the Nether or End drops items there
and respawns the player in the Overworld.

Only the active dimension retains generated chunk arrays. Inactive terrain is
reduced to edits, and its simulation pauses. Travel resets chunk/entity meshes
before rendering the new dimension, preventing chunk-key collisions between
dimensions. All textures, model code, simulation and CSS remain downstream of
the existing user-triggered game import. No global listeners or timers are added.

The transitive optional-theme import guard and browser network/CSS guards cover
the new code. Normal light/dark routes must not fetch game assets, engines or
styles. The existing raw-HTML SEO checks remain unchanged. These are resource
isolation checks, not claims about production Core Web Vitals or search ranking.

## Scope and tests

This is a presentation-only easter egg. No benchmark data, filter, data view,
API, skill output, route, metadata or sharing parameter changes; the public-view
API/skills parity requirement is therefore excluded.

`mc-endgame.test.ts` covers frame validation, both portal orientations,
round-trip travel, terrain generation, twelve-eye activation, dragon/crystal
combat, rewards, completion, versioned saves, death and arrow collision.
`mc-game.test.ts` retains the existing crafting, mining, physics and save
regressions. Browser tests cover launched-game interactions separately from the
default light/dark resource and SEO checks.

## 中文说明

Minecraft 彩蛋新增了可通关的生存流程：搭建并点燃黑曜石传送门，进入下界，
在下界砖桥梁上击败烈焰人获取烈焰棒，击败末影人获取珍珠，合成十二颗末影之眼。
返回主世界后，用末影之眼定位地下要塞并填满十二个门框，进入末地。
摧毁十个治疗水晶，击败末影龙，再进入岛屿中央的出口传送门即可通关并返回出生点。
暂停菜单中提供中英文说明，通关后可以继续游玩。

这是独立的浏览器实现，地形和战斗经过简化，不等同于完整 Java/Bedrock 版本。
下界要塞为重复生成的桥梁结构；尚未实现末地外岛、末地城、鞘翅、末影龙复活仪式或原版终末之诗。
此版本支持羊毛转线，末影之眼可以回收。生存流程需要简单、普通或困难难度。

存档版本 2 分别保存三个维度的修改、容器、生物、掉落物和首领状态，兼容版本 1
的主世界存档。玩家和物品栏在维度间共享。非活动维度暂停模拟，只保留地形修改，
切换时清理旧的区块和实体渲染资源。

所有新增代码、贴图和样式仍位于用户主动启动游戏之后的动态加载边界内。
新增单元测试并扩展默认主题的资源隔离检查；现有 SEO 检查保持不变。
未修改基准测试数据、筛选项、公开数据视图、API、skills、路由或页面元数据，
因此按纯展示彩蛋处理，不涉及 API/skills 数据对等变更。

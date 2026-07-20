# Brand logos — provenance

Third-party marks used to indicate tool/ecosystem compatibility on the skill
catalog (nominative use). Each file lists its source, the variant chosen, and
the fetch date. All trademarks belong to their owners. Consumed via
`src/data/integrations.json` (name → file) and `src/data/skill-brands.json`
(skill → name).

| File | Brand | Source (fetched from) | Notes |
|---|---|---|---|
| ros.svg | ROS 2 | Simple Icons (`cdn.simpleicons.org/ros/9DB4E4`) | fetched 2026-07-20; custom light tint of the ROS navy (#22314E is invisible on the dark theme); also used for RViz2, which has no official mark of its own |
| nvidia.svg | NVIDIA (Isaac Sim/Lab) | Simple Icons (`cdn.simpleicons.org/nvidia`) | fetched 2026-07-20; brand color #76B900 |
| huggingface.svg | Hugging Face | Simple Icons (`cdn.simpleicons.org/huggingface`) | fetched 2026-07-20; brand color #FFD21E |
| docker.svg | Docker | Simple Icons (`cdn.simpleicons.org/docker`) | fetched 2026-07-20; brand color #2496ED |
| uv.svg | uv (Astral) | Simple Icons (`cdn.simpleicons.org/uv`) | fetched 2026-07-20; brand color #DE5FE9 |
| gazebo.svg | Gazebo | gazebosim.org/assets/images/logos/gazebo_horz_neg.svg | fetched 2026-07-20; "neg" = official dark-background variant |
| nav2.png | Nav2 | docs.nav2.org/_static/nav2_48x48.png | fetched 2026-07-20; official docs icon (70×70 actual) |
| lerobot.png | LeRobot | github.com/huggingface/lerobot media/readme/lerobot-logo-thumbnail.png | fetched 2026-07-20; downscaled locally to 295×96 (sips) |
| foxglove.svg | Foxglove | foxglove.dev/logos/foxglove-logo-light.svg | fetched 2026-07-20; white wordmark (for dark backgrounds) |
| rerun.png | Rerun | github.com/rerun-io/rerun crates/viewer/re_ui/data/logo_dark_mode.png | fetched 2026-07-20; dark-mode variant (152×32) |
| mujoco.svg | MuJoCo | github.com/google-deepmind/mujoco doc/images/banner.svg | fetched 2026-07-20; gradient wordmark banner |

Adding a logo: prefer the project's own published asset (brand page, repo, or
site) over third-party redraws; pick the dark-background variant (the site is
dark-themed); record source + variant + fetch date here; add the
integrations.json entry and, if a skill maps to it, the skill-brands.json line.

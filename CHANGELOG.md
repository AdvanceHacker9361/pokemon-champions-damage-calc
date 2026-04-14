# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

## [1.0.0] - 2026-04-14

### Added
- Complete single-battle damage calculator for Pokemon Champions
- SP system (0–32 per stat, 66 total cap) replacing EV system
- Mega Evolution support (~60 forms) with pre-computed base stats
- Gen9 damage formula with exact modifier ordering: Weather→Critical→Random→STAB→Type→Burn→Other
- Special move handling: イカサマ, ボディプレス, ジャイロボール, くさむすび, etc.
- KO probability via dynamic programming over 16 RNG rolls
- Type chart (18×18) with full effectiveness calculation
- Weather/Terrain/Wall/Trick Room field state toggles
- Rank modifiers (±6 for all stats)
- Status condition effects (burn halves physical damage)
- Damage bar with color-coded KO indicators (1HKO=red, 2HKO=orange, 3HKO=yellow, 4+HKO=green)
- PWA support for offline use
- GitHub Actions CI/CD with GitHub Pages deployment
- 64 unit tests (domain + application layer)

### Test Cases Verified
- Garchomp (Jolly, A32/S32/H2): A=200 / S=154 / HP=184 ✓
- Mega Gengar (Timid, C32/S32): C=222 / S=200 ✓

## [0.1.0] - 2026-04-14

### Added
- Project initialization
- Domain models: StatPoints, Pokemon, Move, BattleField, DamageResult
- Domain calculators: StatCalculator, DamageCalculator, KoProbabilityCalc, SpecialMoveCalc
- Data layer: JSON databases (pokemon, mega, moves, abilities, items, natures, type-chart)
- Application use cases: CalculateDamage, CalculateStats, SearchPokemon, ApplyMegaEvolution
- Presentation layer: Zustand stores + React hooks + UI components
- PWA support (offline calculation)
- GitHub Actions CI/CD pipeline
- URL state sharing

### Test Cases Verified
- Garchomp (Jolly, A32/S32/H2): A=200 / S=154 / HP=184 ✓
- Mega Gengar (Timid, C32/S32/D2): C=222 / S=200 ✓

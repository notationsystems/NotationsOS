# Recorded-dataset qualification

Qualification study: 2026-09-06 UTC. **Boreas is a candidate source, not an imported corpus.** This study read provider documentation and bounded public object-list metadata. It downloaded no sensor records and created no acquisition, normalization, admission or release receipt. Local replay fixtures are synthetic operator records, not Boreas observations.

## Source choice and presence

The original Boreas dataset is the first qualification candidate: outdoor Toronto traversals, repeated across seasons, with camera, LiDAR and GNSS/inertial evidence. The provider reference is pinned to pyboreas revision `c4fb97e74741ca8537259682456ee3cbca265444`; a documentation pin does not pin mutable S3 objects. [Provider reference](https://github.com/utiasASRL/pyboreas/blob/c4fb97e74741ca8537259682456ee3cbca265444/DATA_REFERENCE.md)

| Capability | Provider documentation | Payload OS actual state |
|---|---|---|
| Camera, LiDAR, poses, IMU | PRESENT | NOT_IMPORTED |
| Intrinsics and sensor extrinsics | PRESENT | NOT_IMPORTED; calibration not verified locally |
| Common UTC timestamps | PRESENT; measurements asynchronous | NOT_IMPORTED; no clock-error measurement |
| Repeated collection sessions | PRESENT | NOT_IMPORTED; no cross-session object match |
| Per-observation RTK fixed/float and correction age | Not established | UNRESOLVED; no invented status |
| Full pose/calibration covariance | Not established by standard pose schema | UNRESOLVED; not zero covariance |
| Real-source replay, Earth placement, acceptance demonstration | Not implied by provider availability | ABSENT |

Boreas reports **RTX-corrected**, post-processed GNSS/INS. RTX must not be relabelled RTK. Receiver status, where later supplied, is evidence about the solution, not an accuracy guarantee. The SDK explicitly distinguishes shared timing from simultaneous measurements. [SDK explanation](https://github.com/utiasASRL/pyboreas/blob/c4fb97e74741ca8537259682456ee3cbca265444/README.md)

## Rights boundary

The [provider data licence](https://github.com/utiasASRL/pyboreas/blob/c4fb97e74741ca8537259682456ee3cbca265444/DATA_LICENSE.md) states CC BY 4.0. Retain attribution, source and licence links, supplied notices, and modification history; do not imply endorsement or impose prohibited downstream restrictions. Copyright permission does not establish privacy, publicity or other third-party permissions. Customer publication remains a separate reviewed decision. [Licence conditions](https://creativecommons.org/licenses/by/4.0/)

Oxford RobotCar was also considered. Its ordinary dataset licence is CC BY-NC-SA 4.0 for noncommercial academic use; commercial use requires separate arrangements. It is not an interchangeable authorized fallback. [Oxford licence](https://robotcar-dataset.robots.ox.ac.uk/), [access conditions](https://mrgdatashare.robots.ox.ac.uk/register/)

## Bounded candidate objects

Public S3 listing metadata observed these objects beneath `boreas-2020-11-26-13-58/`. Sizes are listing observations, **not captured bytes, verified content hashes or immutable receipts**.

| Object suffix | Listed bytes |
|---|---:|
| `camera/1606417097547313.png` | 2,673,149 |
| `lidar/1606417097502930.bin` | 5,120,304 |
| `calib/P_camera.txt` | 253 |
| `calib/T_applanix_lidar.txt` | 401 |
| `calib/T_camera_lidar.txt` | 249 |
| `calib/camera0_intrinsics.yaml` | 288 |
| `applanix/camera_poses.csv` | 5,302,421 |
| `applanix/lidar_poses.csv` | 2,597,071 |
| `applanix/imu_raw.csv` | 21,032,908 |
| `applanix/gps_post_process.csv` | 77,647,402 |

Inventory access follows the provider's public, unsigned S3 instructions; full sequences are approximately 100 GB. No recursive dataset download is needed or authorized by this qualification. [Download guidance](https://github.com/utiasASRL/pyboreas/blob/c4fb97e74741ca8537259682456ee3cbca265444/download.md)

The listed image and scan differ by **44.383 ms**. This is timestamp arithmetic, not evidence of the same object. The raw IMU CSV alone is approximately 20.1 MiB, exceeding the existing 8 MiB intake bound. Do not silently increase that bound or call a truncated response the original file. The next source adapter needs a bounded provenance-preserving slice contract: exact parent identity/version, explicit byte or record selection, retained selected bytes, completeness semantics and a derivation receipt. No such slice has been imported here.

## Required adapter and acceptance

Preserve UTC microseconds and timestamp meaning: exposure midpoint, scan midpoint and per-point time. Keep processed `imu.csv` distinct from `imu_raw.csv`; the latter uses x-backwards/y-left/z-up, not the Applanix reference frame. Preserve transform direction, calibration version, units and the documented geodetic realization/epoch. Missing mounting transforms or time mappings must refuse placement. Do not manufacture camera depth from pixels or treat a scan as instantaneous. The published typical position error is not object uncertainty. [Format and calibration reference](https://github.com/utiasASRL/pyboreas/blob/c4fb97e74741ca8537259682456ee3cbca265444/DATA_REFERENCE.md)

The raw-IMU axis description must be reconciled with a verified frame convention before mapping into the replay contract's right-handed frames; no mounting transform or handedness conversion is inferred from prose.

Real acceptance requires retained permitted observations, calibrated placement across sensors and at least two sessions, explicit object-association evidence, residual comparison and an explanation of remaining uncertainty. Synthetic transform tests cannot satisfy it. Radar, communications, inference, canonical admission and customer distribution remain separate boundaries.

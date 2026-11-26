# Data sources

## Dataset
Amazon Berkeley Objects (ABO), https://amazon-berkeley-objects.s3.amazonaws.com/index.html (public bucket `amazon-berkeley-objects.s3.amazonaws.com`). Accessed 2026-11-24 (system date). Only public files from that host were downloaded. No scraping, no Amazon-internal data, systems, credentials or work accounts.

## Licence (verified against the dataset page)
The dataset page states: "This work is licensed under the Creative Commons Attribution 4.0 International Public License (CC BY 4.0)". The licence text is `LICENSE-CC-BY-4.0.txt` in the bucket and inside the listings archive; a copy is at `data/raw/LICENSE-CC-BY-4.0.txt` (SHA-256 `419896AEA50C15D6E40C5B4BAF4BD346F78223B9A354C7357AD00262AFDC08EC`). Licence URL: https://creativecommons.org/licenses/by/4.0/.

**Discrepancy:** the task brief and DATA-PLAN section 2 expected CC BY-NC 4.0. The dataset's own page says CC BY 4.0, which is more permissive, so the plan's "or a more permissive licence" condition holds. The non-commercial restriction is therefore a project choice, not a dataset term.

Images and metadata belong to their original rights holders under the dataset licence. Used for non-commercial portfolio research; no commercial use.

## Citation (as given on the dataset page)
```
@article{collins2022abo,
  title={ABO: Dataset and Benchmarks for Real-World 3D Object Understanding},
  author={Collins, Jasmine and Goel, Shubham and Deng, Kenan and Luthra, Achleshwar and
          Xu, Leon and Gundogdu, Erhan and Zhang, Xi and Yago Vicente, Tomas F and
          Dideriksen, Thomas and Arora, Himanshu and Guillaumin, Matthieu and
          Malik, Jitendra},
  journal={CVPR},
  year={2022}
}
```

## Files downloaded
| File | Bytes | SHA-256 |
|---|---|---|
| `archives/abo-listings.tar` | 87,480,320 | `B7F7CEACB328FA5AB6E143B88E1F948443A877CFC95B67FF09C8EBABD50644E3` |
| `images/metadata/images.csv.gz` | 6,430,535 | `915263EF354D7A5D3503E899E610082F510C0011CCCD5B4DC4F4C5EFA86EF539` |
| `LICENSE-CC-BY-4.0.txt` | 14,527 | `419896AEA50C15D6E40C5B4BAF4BD346F78223B9A354C7357AD00262AFDC08EC` |
| `index.html` (dataset page) | 48,296 | not recorded |
| 700 images from `images/small/<path>` | 4,596,330 total | named by content hash in `data/images/` |

## Sample
147,702 listing records; 8,766 passed eligibility (English title, colour and material present, product type and main image resolvable, title 10-250 characters, one listing per brand/model-or-title group). The sample is the first 175 per category in ascending SHA-256 order of `"listing-mismatch-v1|" + item_id`.

| Category (`product_type`) | Listings | of which country IN |
|---|---|---|
| SHOES | 175 | 160 |
| CHAIR | 175 | 5 |
| TABLE | 175 | 17 |
| SOFA | 175 | 38 |
| **Total** | **700** | 220 |

All 700 have a downloaded JPEG (all downloads succeeded, no replacements) plus title, colour, material and product type. Manifest: `data/splits/abo-sample.json`; inventory: `data/splits/inventory.json`.

Deviations from DATA-PLAN section 3.5, for owner review:
- Only SHOES and CHAIR reach 250 eligible candidates, and the fill rule would pick phone cases and the generic `HOME` type. The categories were fixed instead as SHOES, CHAIR, TABLE, SOFA (each at least 200 eligible).
- The sample has no apparel (footwear plus furniture). The plan requires saying so.
- Material was required (the plan treats it as optional); this narrows the pool.
- The image-size, magic-byte and size checks were applied (JPEG, 1 KB to 2 MB). The 512 px check was not applied to the small file's pixel size; `w`/`h` in the manifest are the original image dimensions.
- The country-IN preference (plan 3.3 rule 6) was not applied; the IN count is above.
- The plan's stage-0 freeze, `SOURCES.lock.json`, licence-text hashing inside the fetch script, and the set split/planting are not done here. The plan's `docs/DATA-SOURCES.md` location was overridden by the task, which asked for this path.

## Exclusion for any public package
`data/` (raw archives, listing shards, images, manifests) is excluded from any public package. At most 12 demo thumbnails and listing ids may be included, with the citation above and attribution, at the owner's decision at publishing time. A `.gitignore` entry for `data/` is in place.

## Scripts
`scripts/fetch-abo.cjs` (downloads the two files), `scripts/sample-abo.cjs` (`inventory`, `download`). Node.js only.

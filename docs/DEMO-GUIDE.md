# Demo guide: listing photo-vs-text mismatch detector

This guide explains what the tool does, walks through a demo with example listings, and shows the results you should expect.

Live site: https://anirudhkaushik0211.github.io/listing-mismatch/
Live check: https://anirudhkaushik0211.github.io/listing-mismatch/demo/live.html
Pilot results: https://anirudhkaushik0211.github.io/listing-mismatch/demo/

## 1. The problem

On marketplaces, the product photo and the listing text often disagree: the title says "Blue" but the photo shows a red chair, or the item type says "chair" but the photo shows a table. These contradictions are generally believed to cause returns and complaints (this project does not measure that). Rules cannot read pixels, and people cannot review millions of listings.

## 2. What the tool does

For each listing, it sends the main product photo plus the title and key attributes to a vision-language model (Google Gemini) and asks, attribute by attribute: does the photo agree with the text?

For each attribute it returns:

| Field | Meaning |
|---|---|
| Verdict | `match`, `mismatch` or `cannot_tell` |
| Confidence | 0 to 1, the model's stated confidence |
| Reason | One line explaining the verdict |
| Effective verdict | A `mismatch` only counts if confidence is at least 0.9 (the frozen threshold, tau). Below that it is treated as `cannot_tell`, so the tool only flags what it is sure about. |

Attributes checked: colour, item type, material, pack count and pattern (when the listing provides them).

A simple non-AI colour check (pixel colour of the product versus the listed colour) runs alongside, so you can see where the AI adds value over a rule.

## 3. How it works

1. **Input**: one image plus the title and attributes.
2. **Prompt**: a fixed, versioned prompt asks the model to judge each attribute only from what is visible, and to answer `cannot_tell` rather than guess.
3. **Model call**: one request per listing to Gemini (`gemini-3.5-flash`; Google may serve a newer build behind this name, so the model is "not pinned by the provider").
4. **Parsing and checks**: the answer is parsed strictly; malformed answers are retried once and otherwise recorded as failures, never guessed.
5. **Threshold**: verdicts are compared against the 0.9 confidence threshold.
6. **Output**: a per-attribute table and a CSV or JSON export.

The Live page runs this in your browser with **your own** Gemini API key. The key is kept in the page's memory only, sent only to Google's API, and never saved or sent to the author.

## 4. Demo walkthrough (about 3 minutes)

Before you start: get a free Gemini API key from Google AI Studio (aistudio.google.com, "Get API key"). The free tier allows only about 20 requests per day, so plan on 4 requests for this demo.

### Step 1: open the Live check
Go to the Live check link above, choose **Gemini**, paste your key, and tick the data-use notice.

### Step 2: check one listing (1 request)
Use example A below: upload the image, type the title and attributes, and click **Check**.

### Step 3: check a small batch (3 requests)
Load `demo/sample-set.csv` and the three matching images from `demo/pilot-images/`, then click **Check batch**. You get one row per listing with a verdict per attribute.

### Step 4: export
Click **Export CSV** or **Export JSON** to download the results.

## 5. Example listings and expected results

The verdicts below are real Gemini outputs from the pilot run on practice (dev) listings on 2026-11-25 (model `gemini-3.5-flash`, threshold 0.9). A live run may word the reasons differently, and because the provider can change the model behind the name, verdicts can occasionally differ.

"Planted" means the author deliberately changed one attribute in the listing text to create a known mismatch. "Original" means the value is as published in the source dataset.

### Example A: a clean listing (everything should match)
Image `B000GXF4U2.jpg`. Title: *Strathwood Lanai Dining All-Weather Wicker Table*. Colour: Brown. Item type: table. Material: Wicker.

| Attribute | Listed | Verdict | Confidence | Reason |
|---|---|---|---|---|
| Colour | Brown | match | 0.98 | The table is brown in color. |
| Item type | table | match | 0.99 | The product shown is a table. |
| Material | Wicker | match | 0.95 | The table features visible all-weather wicker weaving. |

What it shows: no false alarms on a correct listing.

### Example B: a planted colour error
Image `B001BSOOJI.jpg`. Title: *Strathwood Folding Canopy Chair, Blue with Silver Frame*. Colour listed: Blue (planted; the original was Red).

| Attribute | Listed | Verdict | Confidence | Reason |
|---|---|---|---|---|
| Colour | Blue | **mismatch** | 0.98 | The chair in the image is red, not blue. |
| Item type | chair | match | 0.99 | The item pictured is a chair. |
| Material | Steel | cannot_tell | 0.80 | Cannot conclusively determine if the metal frame is steel from the image. |

What it shows: it catches the colour error, and it says `cannot_tell` instead of guessing when a photo cannot prove the material.

### Example C: a planted item-type error, and a real catalog error the author did not plant
Image `B000BLI2K8.jpg`. Title: *Strathwood Vashon Collection Teak Oval Expandable Leaf Chair*. Item type listed: chair (planted; the product is a table). Colour listed: Silver (original value from the dataset).

| Attribute | Listed | Verdict | Confidence | Reason |
|---|---|---|---|---|
| Colour | Silver | **mismatch** | 0.99 | The item is natural brown wood, not silver. |
| Item type | chair | **mismatch** | 0.99 | The image shows an expandable table, not a chair. |
| Material | Teak | match | 0.95 | The table appears to be made of teak wood as listed. |

What it shows: it caught the planted item-type error, and it also flagged "Silver" on a brown teak table. That colour was **not** planted: it is the value in the original public listing data. This is exactly the kind of real-world catalog error the tool is meant to surface. (In the scored pilot it counts as a false alarm, because the scoring only knows about planted errors. This is why the full evaluation also uses 200 listings hand-labelled by the author.)

### Example D: a correct listing confirmed by a human label
Image `B004C046RM.jpg`. Title: *Strathwood Basics Folding Adirondack Chair, Dark Brown*. Colour: Dark Brown. Item type: chair. Material: Wood.

| Attribute | Listed | Verdict | Confidence | Reason |
|---|---|---|---|---|
| Colour | Dark Brown | match | 0.95 | The chair in the image is dark brown. |
| Item type | chair | match | 0.98 | The image shows an Adirondack chair. |
| Material | Wood | match | 0.90 | The chair appears to be made of dark-stained wood slats. |

What it shows: agreement with the author's own label (match on all three).

The batch file `demo/sample-set.csv` contains examples C, A and D, so the batch run should show two clean listings and one listing with two mismatches.

## 6. Pilot numbers (practice data, small samples)

On 15 planted practice listings:

| Attribute | Planted errors caught (recall) | Flags that were planted errors (precision) |
|---|---|---|
| Colour | 7 of 7 (95% interval 0.65 to 1.00) | 7 of 9 (0.45 to 0.94) |
| Item type | 4 of 4 (0.51 to 1.00) | 4 of 5 (0.38 to 0.96) |

These are pilot figures on practice data with very small samples, **not** the evaluation. Some "false alarms" are real catalog errors, as Example C shows. The pre-registered evaluation (584 held-out listings, pass rule fixed before measuring) is in progress.

## 7. Limits to state up front

- Pilot results come from practice data; the full evaluation is still running.
- Sample: public Amazon Berkeley Objects listings (CC BY 4.0), footwear and furniture only, no apparel.
- One model (Gemini), not pinned by the provider; results can shift if Google updates it.
- The free tier limits you to about 20 requests per day.
- It reads only what the photo shows; it cannot verify things a photo cannot prove (for example, exact material).
- No users, no production deployment and no adoption are claimed.
- Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

## 8. A 60-second explanation

"Listings often say one thing while the photo shows another, like a blue chair that is actually red. This tool sends the photo and the listing text to a vision model and asks, attribute by attribute, whether they agree, with a confidence and a reason. It only flags when it is at least 90% confident, and says 'can't tell' instead of guessing. In the pilot it caught every planted colour and item-type error, and it also found a real error in the public data: a brown teak table listed as silver. I set the pass rule before measuring, and the full evaluation on 584 held-out listings is running now."

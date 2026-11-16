# Sign AI outputs

Prove exactly what a model produced, and when, before anyone can edit it. One script, no dependencies (Node 18+).

```sh
node sign-output.mjs image.png --model "my-image-model v2"
your-llm "write a haiku" | node sign-output.mjs --model gpt-x --out haiku.txt
node sign-output.mjs answer.txt --model gpt-x --prompt prompt.txt
```

Each run writes:

- `<output>.moonmark.json`: the output's signed receipt and proof link, plus a manifest receipt.
- `<output>.manifest.json`: which model made it and the prompt's fingerprint, signed on Moon too, so they can't be swapped later.

Anyone can drop the output on [moon369.org/verify](https://moon369.org/verify) to see when it was registered and that it's labelled AI-generated. Change one byte and it no longer matches.

**In your generator:** call it right after you write each file, or copy `sign()` into your code. Only SHA-256 fingerprints are sent, never the output or the prompt. Add `MOON_KEY` (free at [moon369.org/api#key](https://moon369.org/api#key)) to register outputs under your verified name and lift the rate limit.

**Writing C2PA too?** For images and video, [`moon369-capture`](../../packages/capture) writes Content Credentials with `digitalSourceType: trainedAlgorithmicMedia` and the Moon receipt inside, so any C2PA tool shows it as AI-made.

Moon proves when something was registered and by whom. It does not detect whether content is AI-made: the honest label has to come from the tool that made it.

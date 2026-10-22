# G0 demo artifact: structured output through the API

Demo folder for the Study Hub exam gate. It is a deliberately incomplete artifact: the code
part is real, the cost part is a stub, so the examiner should pass some checks and report gaps
on the others. Use it to see how the gate reads a folder, quotes files and verifies quotes.

## What is here

- `main.py`: one request to the Anthropic Messages API with a JSON schema in the system prompt,
  client-side validation of the answer against that schema, a retry budget of 3 attempts for
  invalid or truncated answers, `max_tokens` and a stop sequence set, `stop_reason` handled.

## Run

```
set ANTHROPIC_API_KEY=...
python main.py "Which city is the capital of Kazakhstan?"
```

The script prints the `usage` block of every attempt to stderr.

## Cost of one request

Not computed yet. To close this check, run the script, take `input_tokens` and `output_tokens`
from the printed `usage` block, multiply them by the price per million tokens from the model's
price page, and write the numbers here.

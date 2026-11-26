import json
import re
import sys
from pathlib import Path

api, web = (json.loads(Path(name).read_text()) for name in sys.argv[1:])
enterprise = re.compile(r"(?:^|/)(?:packages/ee/|packages/server/api/src/app/ee/|@activepieces/ee(?:[-/]|$)|@activepieces/ee-embed-sdk)")
provider = re.compile(r"node_modules/(?:\.bun/[^/]+/node_modules/)?(?:posthog-js/|posthog-node/|@posthog/|@sentry/)|^(?:posthog-js|posthog-node|@posthog/|@sentry/)")
paths = list(api["inputs"]) + web
paths.extend(item["path"] for output in api["outputs"].values() for item in output.get("imports", []) if item.get("external"))
if not api["inputs"] or not web:
    raise SystemExit("Missing build inventory")
bad = sorted({path for path in paths if enterprise.search(path.replace("\\", "/")) or provider.search(path.replace("\\", "/"))})
if bad:
    raise SystemExit("Excluded inputs:\n" + "\n".join(bad))
print(f"API {len(api['inputs'])}, web {len(web)}. No excluded module input detected.")

// Tests the pure functions in scripts/jobspy_search.py by importing it as a
// module in a real Python subprocess. The module must be importable WITHOUT
// python-jobspy installed (imports happen only during setup) — that is
// itself part of the contract under test, since CI runners lack the package.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PYTHON = process.env.JOBSPY_PYTHON || "python";
const SCRIPTS_DIR = path.resolve(__dirname, "../../../scripts");

const pythonAvailable = spawnSync(PYTHON, ["--version"], { timeout: 10_000 }).status === 0;

function runPyProcess(lines: string[]) {
  const code = [`import sys, json`, `sys.path.insert(0, ${JSON.stringify(SCRIPTS_DIR)})`, `import jobspy_search as m`, ...lines].join("\n");
  return spawnSync(PYTHON, ["-c", code], { encoding: "utf8", timeout: 30_000 });
}

/** Runs `python -c` with jobspy_search importable as `m`; returns parsed stdout JSON. */
function runPy(lines: string[]): unknown {
  const result = runPyProcess(lines);
  if (result.status !== 0) {
    throw new Error(`python exited ${result.status}: ${result.stderr}`);
  }
  // JSON.parse is the real consumer contract — the Node adapter does exactly this.
  return JSON.parse(result.stdout);
}

// Match the pinned package's private signatures without requiring JobSpy or
// making real requests. Any upstream operation is recorded by the fake.
const compatibleJobSpy = [
  `from types import ModuleType, SimpleNamespace`,
  `calls = []`,
  `class RequestsRotating:`,
  `    def setup_session(self, has_retry, delay):`,
  `        if has_retry: raise AssertionError('hidden retries enabled')`,
  `    def mount(self, prefix, adapter):`,
  `        if adapter.max_retries != 0: raise AssertionError('hidden retries enabled')`,
  `    def send(self, request, **kwargs):`,
  `        calls.append('send')`,
  `        return SimpleNamespace(status_code=429, url='https://example.com', headers={'Retry-After': '30'})`,
  `class TLSRotating:`,
  `    def execute_request(self, *args, **kwargs):`,
  `        calls.append('execute_request')`,
  `        return SimpleNamespace(status_code=429, url='https://example.com', headers={'Retry-After': '30'})`,
  `jobspy = ModuleType('jobspy')`,
  `def scrape_jobs(**kwargs):`,
  `    calls.append('scrape')`,
  `    return SimpleNamespace(to_dict=lambda **kw: [])`,
  `jobspy.scrape_jobs = scrape_jobs`,
  `util = ModuleType('jobspy.util')`,
  `util.RequestsRotating = RequestsRotating`,
  `util.TLSRotating = TLSRotating`,
  `adapters = ModuleType('requests.adapters')`,
  `adapters.HTTPAdapter = lambda max_retries: SimpleNamespace(max_retries=max_retries)`,
  `sys.modules.update({'jobspy': jobspy, 'jobspy.util': util, 'requests': ModuleType('requests'), 'requests.adapters': adapters})`,
  `m.metadata.version = lambda name: '1.1.82'`,
  `sys.argv = ['jobspy_search.py', '--site', 'indeed', '--keywords', 'engineer']`,
];

describe.skipIf(!pythonAvailable)("scripts/jobspy_search.py", () => {
  it.each([
    ["wrong version", `m.metadata.version = lambda name: '1.1.81'`, "1.1.81"],
    ["missing distribution", `def missing(name): raise m.metadata.PackageNotFoundError(name)\nm.metadata.version = missing`, "python-jobspy"],
    ["missing hook", `del TLSRotating.execute_request`, "TLSRotating.execute_request"],
    ["noncallable hook", `RequestsRotating.send = None`, "RequestsRotating.send"],
    ["changed signature", `TLSRotating.execute_request = lambda self, request: None`, "TLSRotating.execute_request"],
  ])("refuses %s before scraping or partially installing hooks", (_name, mutation, diagnostic) => {
    const result = runPyProcess([
      ...compatibleJobSpy,
      mutation,
      `targets = [(RequestsRotating, 'setup_session'), (RequestsRotating, 'send'), (TLSRotating, 'execute_request')]`,
      `originals = [getattr(owner, name, None) for owner, name in targets]`,
      `try: m.main()`,
      `finally:`,
      `    unchanged = all(getattr(owner, name, None) is original for (owner, name), original in zip(targets, originals))`,
      `    print(json.dumps({'calls': calls, 'unchanged': unchanged}), file=sys.stderr)`,
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(diagnostic);
    expect(result.stderr).toContain("pip install --force-reinstall python-jobspy==1.1.82");
    expect(JSON.parse(result.stderr.trim().split("\n").at(-1)!)).toEqual({ calls: [], unchanged: true });
  });

  it.each([
    ["requests", `session = RequestsRotating()\nsession.setup_session(True, 1)`, `session.send(None)`, "send"],
    ["TLS", `session = TLSRotating()`, `session.execute_request('GET', 'https://example.com')`, "execute_request"],
  ])("guards the pinned %s hook even when the scraper swallows failures", (_name, setup, request, upstream) => {
    expect(runPy([
      ...compatibleJobSpy,
      `guard = m.RequestGuard(1)`,
      `m.install_request_guard(guard)`,
      setup,
      `def scraper(**kwargs):`,
      `    for _ in range(2):`,
      `        try: ${request}`,
      `        except RuntimeError: pass`,
      `    return SimpleNamespace(to_dict=lambda **kw: [])`,
      `result = m.scrape_board(scraper, 'indeed', 'engineer', None, False, 10, guard)`,
      `print(json.dumps([result['status'], result['retryAfterSeconds'], calls]))`,
    ])).toEqual(["rate-limited", 30, [upstream]]);
  });

  it("distinguishes a Google challenge, forbidden access, location failure, and other errors", () => {
    expect(runPy([`print(json.dumps([m.classify_failure(s) for s in ['HTTP 429', 'https://www.google.com/sorry/index', 'HTTP 403 forbidden', 'Glassdoor location not parsed', 'timeout']]))`]))
      .toEqual(["rate-limited", "rate-limited", "blocked", "invalid-request", "error"]);
  });

  it("stops after the first blocked HTTP response and preserves Retry-After", () => {
    expect(runPy([
      `from types import SimpleNamespace`,
      `guard = m.RequestGuard(3)`,
      `calls = []`,
      `def request():`,
      `    calls.append(1)`,
      `    return SimpleNamespace(status_code=429, url='https://www.google.com/sorry/index', headers={'Retry-After': '3600'})`,
      `for _ in range(3):`,
      `    try: guard.call(request)`,
      `    except RuntimeError: pass`,
      `print(json.dumps([len(calls), guard.retry_after, m.classify_failure(guard.failure)]))`,
    ])).toEqual([1, 3600, "rate-limited"]);
  });

  it("keeps logged failures distinct from zero matches and preserves partial results", () => {
    expect(runPy([
      `from types import SimpleNamespace`,
      `logger = m.logging.getLogger('JobSpy:Glassdoor')`,
      `def scraper(**kwargs):`,
      `    assert kwargs['site_name'] == ['glassdoor']`,
      `    logger.error('Glassdoor response status code 400')`,
      `    return SimpleNamespace(to_dict=lambda **kw: [{'site': 'glassdoor', 'title': 'Engineer', 'job_url': 'https://example.com/1'}])`,
      `result = m.scrape_board(scraper, 'glassdoor', 'engineer', 'Atlanta, GA', False, 10, m.RequestGuard(3))`,
      `print(json.dumps([result['status'], len(result['items'])]))`,
    ])).toEqual(["invalid-request", 1]);
  });

  it("a failed Google scrape cannot prevent a separate successful board", () => {
    expect(runPy([
      `from types import SimpleNamespace`,
      `def scraper(**kwargs):`,
      `    if kwargs['site_name'] == ['google']: raise RuntimeError('too many 429 responses')`,
      `    return SimpleNamespace(to_dict=lambda **kw: [{'site': 'indeed', 'title': 'Engineer', 'job_url': 'https://example.com/1'}])`,
      `results = [m.scrape_board(scraper, site, 'engineer', None, False, 10, m.RequestGuard(3)) for site in ['google', 'indeed']]`,
      `print(json.dumps([[r['status'], len(r['items'])] for r in results]))`,
    ])).toEqual([["rate-limited", 0], ["ok", 1]]);
  });
  it("sanitize_records nulls NaN-like values and keeps real ones", () => {
    const records = runPy([
      `records = m.sanitize_records([{`,
      `  'site': 'indeed', 'id': '1', 'company': float('nan'), 'title': 'Engineer',`,
      `  'location': None, 'job_url': 'https://example.com/j/1',`,
      `  'date_posted': float('nan'), 'description': 'text'`,
      `}])`,
      `print(json.dumps(records))`,
    ]) as Array<Record<string, unknown>>;
    expect(records[0].company).toBeNull();
    expect(records[0].date_posted).toBeNull();
    expect(records[0].title).toBe("Engineer");
    expect(records[0].description).toBe("text");
  });

  it("sanitize_records keeps only the fields the Node adapter consumes", () => {
    const records = runPy([
      `records = m.sanitize_records([{`,
      `  'site': 'indeed', 'id': '1', 'title': 'Engineer', 'job_url': 'https://example.com/j/1',`,
      `  'min_amount': float('nan'), 'max_amount': 120000.0, 'emails': ['a@b.c'], 'is_remote': True`,
      `}])`,
      `print(json.dumps(records))`,
    ]) as Array<Record<string, unknown>>;
    expect(Object.keys(records[0]).sort()).toEqual(["company", "date_posted", "description", "id", "job_url", "location", "site", "title"]);
  });

  it("build_google_search_term composes keywords, location, and remote", () => {
    const terms = runPy([
      `print(json.dumps([`,
      `  m.build_google_search_term('python developer', None, False),`,
      `  m.build_google_search_term('python developer', 'Atlanta, GA', False),`,
      `  m.build_google_search_term('python developer', None, True),`,
      `]))`,
    ]);
    expect(terms).toEqual(["python developer jobs", "python developer jobs near Atlanta, GA", "python developer jobs remote"]);
  });
});

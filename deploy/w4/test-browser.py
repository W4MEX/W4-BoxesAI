import base64
import json
import os
import time
import urllib.request
import websocket

origin = os.environ.get('W4_BROWSER_ORIGIN', 'http://w4-mit-builder')
state = json.load(open('/tmp/w4-test-users.json'))
target = json.load(urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:9222/json/new?about:blank', method='PUT')))
ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=45)
sequence = 0
errors = []

def command(method, params=None):
    global sequence
    sequence += 1
    ws.send(json.dumps({'id': sequence, 'method': method, 'params': params or {}}))
    while True:
        message = json.loads(ws.recv())
        if message.get('method') == 'Runtime.exceptionThrown':
            errors.append(message['params']['exceptionDetails'].get('text', 'JavaScript error'))
        if message.get('id') == sequence:
            if 'error' in message:
                raise RuntimeError(message['error']['message'])
            return message.get('result', {})

def evaluate(expression):
    result = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if 'exceptionDetails' in result:
        raise RuntimeError('Browser script failed: ' + result['exceptionDetails'].get('text', 'unknown'))
    return result.get('result', {}).get('value')

def wait_for(expression, timeout=60):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if evaluate('Boolean(' + expression + ')'):
            return
        time.sleep(0.5)
    raise RuntimeError('Browser condition timed out: ' + expression)

def navigate(route):
    command('Page.navigate', {'url': origin + route})
    wait_for("document.readyState === 'complete'")

def screenshot(name):
    result = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
    open('/tmp/' + name + '.png', 'wb').write(base64.b64decode(result['data']))

command('Page.enable')
command('Runtime.enable')
command('Storage.clearDataForOrigin', {'origin': origin, 'storageTypes': 'all'})
command('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
navigate('/sign-in')
wait_for("document.querySelector('[data-testid=sign-in-email]')")
for name in ['email', 'password']:
    value = json.dumps(state['owner'][name])
    evaluate("(()=>{const el=document.querySelector('[data-testid=sign-in-" + name + "]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el," + value + ");el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()")
evaluate("document.querySelector('[data-testid=sign-in-button]').click()")
wait_for("localStorage.getItem('token') !== null")
print('PASS Browser password login', flush=True)
owner = state['fixture']['owner']
project = state['fixture']['projectA']
evaluate("localStorage.setItem('token'," + json.dumps(owner['token']) + ");localStorage.setItem('projectId'," + json.dumps(project['id']) + ");")
navigate('/impact')
wait_for("document.body.innerText.includes('Successful runs') && !document.body.innerText.includes('Loading analytics')")
wait_for("document.querySelectorAll('.recharts-bar').length > 0")
assert not evaluate("document.body.innerText.includes('Trouble loading')")
screenshot('w4-analytics')
print('PASS Browser analytics chart and actual run metrics', flush=True)
navigate('/platform/projects')
wait_for("document.body.innerText.includes('W4 isolation A')")
screenshot('w4-projects')
print('PASS Browser organization projects', flush=True)
navigate('/platform/users/roles')
wait_for("document.body.innerText.includes('Editor') && document.body.innerText.includes('Viewer')")
assert not evaluate("document.body.innerText.includes('Contact sales')")
screenshot('w4-roles')
print('PASS Browser W4 roles without sales gating', flush=True)
run = json.load(open('/tmp/w4-flow-results.json'))
navigate('/projects/' + project['id'] + '/flows/' + run['flowId'])
wait_for("document.body.innerText.includes('W4 sum')")
screenshot('w4-flow-editor')
print('PASS Browser flow editor', flush=True)
assert not errors, errors
json.dump({'passed': 5, 'javascriptErrors': errors}, open('/tmp/w4-browser-results.json', 'w'), indent=2)
ws.close()

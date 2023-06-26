import spawn from 'cross-spawn';

function spawnAsync(cmd, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, options);
    let result, error;
    if (options.stdio === 'pipe') {
      child.stdout.on('data', (d) => (result = d.toString()));
      child.stderr.on('data', (d) => (error = d.toString()));
    }
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(error);
      } else {
        resolve(result);
      }
    });
    child.on('error', (e) => reject(e));
  });
}

export default spawnAsync;

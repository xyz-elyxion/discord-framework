// Elyxion Discord Framework — command registry & parser
'use strict';

// Parses a message body into { name, args, text } when it starts
// with the prefix, otherwise returns null.
function parseCommand(content, prefix) {
  const str = String(content || '');
  const pre = String(prefix === undefined ? '!' : prefix);
  if (!str.startsWith(pre)) return null;

  const rest = str.slice(pre.length).trim();
  if (!rest) return null;

  const m = rest.match(/^(\S+)\s*([\s\S]*)$/);
  const name = (m ? m[1] : rest).toLowerCase();
  const tail = m && m[2] ? m[2].trim() : '';

  return {
    name,
    args: tail ? tail.split(/\s+/).filter(Boolean) : [],
    text: tail,
    raw: str
  };
}

class CommandRegistry {
  constructor() {
    this._commands = [];
  }

  // register(name, handler, options) or register({ name, handler, ... })
  register(name, handler, options) {
    if (name && typeof name === 'object') {
      options = name;
      name = options.name;
      handler = options.handler || options.run;
    }
    options = options || {};

    if (!name) throw new TypeError('Command needs a name');
    if (typeof handler !== 'function') throw new TypeError('Command "' + name + '" needs a handler function');

    const command = {
      name: String(name).toLowerCase(),
      aliases: (options.aliases || []).map((a) => String(a).toLowerCase()),
      description: options.description || '',
      usage: options.usage || String(name),
      cooldown: options.cooldown || 0,
      handler
    };
    this._commands.push(command);
    return command;
  }

  find(content, prefix) {
    const parsed = parseCommand(content, prefix);
    if (!parsed) return null;

    for (const command of this._commands) {
      if (command.name === parsed.name || command.aliases.indexOf(parsed.name) !== -1) {
        return Object.assign({}, parsed, { command });
      }
    }
    return null;
  }

  list() {
    return this._commands.slice();
  }
}

module.exports = { CommandRegistry, parseCommand };

UPDATE gym_settings SET value=json_set(value,'$.text',replace(json_extract(value,'$.text'),'온오프','ONOFF')) WHERE key='banner' AND json_valid(value) AND json_type(value,'$.text')='text';

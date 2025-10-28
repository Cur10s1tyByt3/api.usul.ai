import 'dotenv/config';
import Airtable from 'airtable';

if (!process.env.AIRTABLE_GENRES_TOKEN || !process.env.AIRTABLE_GENRES_APP_ID) {
  throw new Error('AIRTABLE_GENRES_TOKEN and AIRTABLE_GENRES_APP_ID are not set');
}

if(!process.env.AIRTABLE_AUTHORS_TOKEN || !process.env.AIRTABLE_AUTHORS_APP_ID) {
  throw new Error('AIRTABLE_AUTHORS_TOKEN and AIRTABLE_AUTHORS_APP_ID are not set');
}

export const genresAirtable = new Airtable({
  apiKey: process.env.AIRTABLE_GENRES_TOKEN,
}).base(process.env.AIRTABLE_GENRES_APP_ID);

export const authorsAirtable = new Airtable({
  apiKey: process.env.AIRTABLE_AUTHORS_TOKEN,
}).base(process.env.AIRTABLE_AUTHORS_APP_ID);

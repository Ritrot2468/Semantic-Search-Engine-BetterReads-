import fs from 'fs';
import readline from 'readline';
import Book from '../model/books.js';

async function bulkImport(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({input: fileStream, terminal: false});
    let batch = [];
  const BATCH_SIZE = 1000;

  for await (const line of rl) {
    const parts = line.split('\t');
    if (parts.length < 5) continue;

    try {
      const raw = JSON.parse(parts[4]);
      
      // Clean ISBNs (Open Library often has arrays of 10 and 13)
      const isbn = raw.isbn_13?.[0] || raw.isbn_10?.[0];
      if (!isbn) continue;

      const bookOp = {
        updateOne: {
          filter: { ISBN: isbn },
          update: {
            $setOnInsert: {
              title: raw.title,
              author: raw.authors ? "Various" : "Unknown", // Simplification for test
              description: typeof raw.description === 'string' ? raw.description : raw.description?.value || "",
              genre: raw.subjects || [],
              image: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
              publishYear: raw.publish_date ? parseInt(raw.publish_date.match(/\d{4}/)?.[0]) : 0,
              // Site metrics initialized
              averageRating: 0,
              ratingsCount: 0,
              reviewCount: 0,
              numberOfEditions: raw.revision || 1
            }
          },
          upsert: true
        }
      };

      batch.push(bookOp);

      if (batch.length >= BATCH_SIZE) {
        await Book.bulkWrite(batch);
        console.log(`Imported ${BATCH_SIZE} books...`);
        batch = [];
      }
    } catch (err) {
      // Skip malformed JSON lines
      continue;
    }
  }

  // Clear remaining
  if (batch.length > 0) await Book.bulkWrite(batch);
  console.log("Done!");
}
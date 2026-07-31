# Yoga Sequence Studio

I want to build a personal web application for creating yoga sequences. This application is only for me, so focus on functionality rather than user accounts or social features.

The design should be clean, modern, minimalistic, and optimized for desktop first, but also work on mobile.

MAIN FEATURES

1. Yoga Pose Library

Create a database of yoga poses.

Each pose should contain:

- Custom photo upload

- Pose name

- Sanskrit name (optional)

- Description / notes

- Duration (optional)

- Difficulty level

- Unlimited tags

- Multiple categories

- Favorite toggle

Examples of categories:

- Warm-up

- Standing

- Balance

- Forward Bends

- Backbends

- Twists

- Hip Openers

- Core

- Arm Balances

- Inversions

- Prone

- Supine

- Cool Down

- Relaxation

- Breathing

- Meditation

Each pose can belong to multiple categories.

Examples of tags:

#hamstrings

#hips

#shoulders

#spine

#strength

#flexibility

#beginner

#advanced

#pregnancy

#restorative

I want to be able to create unlimited custom tags.

2. Pose Library View

Display all poses as cards with:

- photo

- name

- categories

- tags

Include:

- search bar

- filter by category

- filter by tags

- favorites filter

3. Sequence Builder

This is the most important feature.

I want to create a yoga sequence by selecting poses from my library.

The interface should have two panels.

LEFT:

My entire pose library with search and filters.

RIGHT:

Current sequence.

I want to add poses with one click or drag-and-drop.

Inside the sequence I should be able to:

- drag to reorder poses

- delete poses

- duplicate poses

- edit notes for a specific pose inside the sequence

4. Sequence Information

Each sequence should have:

- Title

- Description

- Total duration

- Date created

- Tags

- Level

5. Save Sequences

I want to save unlimited sequences.

I should be able to:

- edit

- duplicate

- delete

- search

6. Export

Export the sequence as a beautiful printable PDF.

The PDF should include:

- pose images

- pose names

- notes (optional)

- clean printable layout on A4

7. Database

Use Supabase as the backend database.

Store:

- poses

- images

- categories

- tags

- sequences

8. Future-proof

Build the project with clean architecture so new features can easily be added later, such as:

- timers

- automatic sequence statistics

- left/right side balance

- pose recommendations

- class planning

- student management

Keep the code clean, modular, and scalable.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/36d91c41-084a-433a-9dcc-80c62177bd14).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

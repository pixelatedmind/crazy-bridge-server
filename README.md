# Crazy Bridge Card Game

A modern, multiplayer implementation of the Crazy Bridge card game built with React, TypeScript, and Socket.IO.

## Features

- **Multiplayer Support**: Play with friends online using room codes
- **Offline Mode**: Play against AI opponents with different personalities
- **Responsive Design**: Optimized for both desktop and mobile devices
- **Real-time Gameplay**: Live updates and synchronization across all players
- **Multiple Game Lengths**: Choose from short (7 cards), standard (10 cards), or long (12 cards) games
- **Bilingual Support**: Available in English and Portuguese
- **Custom Card Ranking**: Unique ranking system (A, 7, K, Q, J, 10, 9, 8, 6, 5, 4, 3, 2)

## How to Play

1. **Bidding Phase**: Predict how many tricks you'll win in each round
2. **Playing Phase**: Play cards following suit when possible
3. **Scoring**: Score 10 + actual wins only if your prediction is exact
4. **Trump Suit**: Changes each round and beats all other suits

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO
- **Icons**: Lucide React
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd crazy-bridge-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Start the multiplayer server (in a separate terminal):
```bash
npm run server
```

### Available Scripts

- `npm run dev` - Start the frontend development server
- `npm run build` - Build the frontend for production
- `npm run preview` - Preview the production build
- `npm run server` - Start the multiplayer server
- `npm run server:dev` - Start the server with auto-reload

## Game Rules

### Bidding
- Each player predicts how many tricks they'll win
- Bidding starts with the player after the dealer
- Players must bid between 0 and the number of cards dealt

### Playing
- First player after dealer leads the first trick
- Players must follow suit if possible
- Trump cards beat all other suits
- Highest card of the lead suit wins (if no trump played)

### Scoring
- Exact prediction: 10 + number of tricks won
- Wrong prediction: 0 points
- Game ends after all rounds in the sequence

### Card Ranking (Highest to Lowest)
1. Ace
2. 7
3. King
4. Queen
5. Jack
6. 10, 9, 8, 6, 5, 4, 3, 2

## Multiplayer Setup

### Hosting a Game
1. Enter your name
2. Click "Host Multiplayer Game"
3. Share the 4-letter room code with friends
4. Wait for players to join
5. Start the game when ready

### Joining a Game
1. Enter your name
2. Click "Join Multiplayer Game"
3. Enter the room code provided by the host
4. Wait for the host to start the game

## Development

### Project Structure
```
src/
├── components/          # React components
├── hooks/              # Custom React hooks
├── services/           # API and multiplayer services
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── App.tsx             # Main application component
```

### Key Components
- `MultiplayerSetup` - Game mode selection and room management
- `GameSetup` - Offline game configuration
- `GameContainer` - Main game interface
- `BiddingModal` - Full-screen bidding interface
- `PlayingField` - Card playing area
- `PlayerHand` - Player's cards display

## Deployment

### Frontend (Netlify)
The frontend can be deployed to Netlify:
```bash
npm run build
# Deploy the dist/ folder to Netlify
```

### Backend (Render/Heroku)
The backend server can be deployed to any Node.js hosting service:
- Set `PORT` environment variable
- Ensure CORS is configured for your frontend domain

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with modern web technologies
- Inspired by the classic Crazy Bridge card game
- Designed for both casual and competitive play
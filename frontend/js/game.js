document.addEventListener("DOMContentLoaded", () => {
  // Colors for legal move highlighting
  const whiteSquareGrey = "#a9a9a9";
  const blackSquareGrey = "#696969";

  // Extract room ID from URL
  const pathParts = window.location.pathname.split("/");
  const roomId = pathParts[pathParts.length - 1];
  document.getElementById("room-id-display").textContent = roomId;

  // Extract query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const role = urlParams.get("role") || "watcher";
  const color = urlParams.get("color") || null;

  // Initialize chess.js game for client-side validation
  const game = new Chess();

  // Initialize chessboard
  const board = Chessboard("board", {
    draggable: true,
    position: "start",
    orientation: "white", // Default orientation
    pieceTheme:
      "/assets/chessboardjs-1.0.0/img/chesspieces/wikipedia/{piece}.png",
    onDragStart: onDragStart,
    onDrop: onDrop,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
    onSnapEnd: onSnapEnd
  });

  // Connect to Socket.IO
  const socket = io();

  // Game state variables
  let currentRole = role;
  let playerColor = null;
  let gameStatus = "loading";

  // Join the room
  socket.emit("join_room", {
    room_id: roomId,
    role: role,
    color: color
  });

  socket.on("game_state", (state) => {
    if (state.forced_watcher) {
      alert("Room is full. You have joined as a watcher.");
      currentRole = "watcher";
    }
    updateGameState(state);
  });

  // Add request_state handler
  socket.on("request_state_response", (state) => {
    updateGameState(state);
  });

  socket.on("move_made", (data) => {
    try {
      const move = game.move(data.move);
      if (!move) {
        console.error("Invalid move received from server:", data.move);
        socket.emit("request_state", { room_id: roomId });
        return;
      }
      board.position(game.fen());
      updateMoveHistory(data.move);

      // Request updated game state to get new scores
      socket.emit("request_state", { room_id: roomId });

      if (data.status !== "ongoing") {
        gameStatus = data.status;
        updateGameStatus();
      }
    } catch (e) {
      console.error("Error processing move:", e);
      socket.emit("request_state", { room_id: roomId });
    }
  });

  // Handle game ending
  socket.on("game_ended", (result) => {
    gameStatus = result.status;
    document.getElementById(
      "game-status"
    ).textContent = `Game ended: ${result.status} (${result.result})`;
    document.getElementById("game-controls").classList.add("hidden");
  });

  // Handle draw offer
  socket.on("draw_offered", (data) => {
    if (data.offered_by !== socket.id && currentRole === "player") {
      document.getElementById("draw-offer").classList.remove("hidden");
    }
  });

  function updateGameState(state) {
    game.load(state.fen);

    if (currentRole === "player") {
      if (socket.id === state.white_player) {
        playerColor = "white";
        board.orientation("white");
      } else if (socket.id === state.black_player) {
        playerColor = "black";
        board.orientation("black");
      }
    } else {
      board.orientation("white");
    }

    board.position(state.fen);

    document.getElementById("white-player").textContent = state.white_player
      ? state.white_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("black-player").textContent = state.black_player
      ? state.black_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("watchers-count").textContent = state.watchers
      ? state.watchers.length
      : 0;

    // Update scores
    document.getElementById("white-score").textContent = state.white_score || 0;
    document.getElementById("black-score").textContent = state.black_score || 0;

    gameStatus = state.status;
    updateGameStatus();

    document.getElementById("move-history").innerHTML = "";
    state.move_history.forEach((move, i) => {
      const moveEl = document.createElement("div");
      moveEl.textContent = `${i + 1}. ${move}`;
      document
        .getElementById("move-history")
        .insertBefore(
          moveEl,
          document.getElementById("move-history").firstChild
        );
    });

    updateControls(state);
  }

  // Remove grey highlighting from squares
  function removeGreySquares() {
    $("#board .square-55d63").css("background", "");
  }

  // Highlight a square with grey
  function greySquare(square) {
    const $square = $("#board .square-" + square);
    const background = $square.hasClass("black-3c85d")
      ? blackSquareGrey
      : whiteSquareGrey;
    $square.css("background", background);
  }

  // Handle drag start
  function onDragStart(source, piece) {
    // Do not pick up pieces if:
    // 1. Game is over
    // 2. User is not a player
    // 3. It's not their turn
    // 4. They try to pick up opponent's piece
    if (
      gameStatus !== "ongoing" ||
      currentRole !== "player" ||
      (playerColor === "white" && !piece.startsWith("w")) ||
      (playerColor === "black" && !piece.startsWith("b"))
    ) {
      return false;
    }
  }

  // Handle piece drop
  function onDrop(source, target) {
    removeGreySquares();

    // Try to make the move
    const move = game.move({
      from: source,
      to: target,
      promotion: "q" // Always promote to queen for simplicity
    });

    // If illegal move, snap back
    if (move === null) return "snapback";

    // Send move to server
    socket.emit("make_move", {
      room_id: roomId,
      move: move.san
    });

    updateMoveHistory(move.san);

    return true;
  }

  // Handle mouseover square - show legal moves
  function onMouseoverSquare(square, piece) {
    // Only show moves for players during their turn
    if (currentRole !== "player" || gameStatus !== "ongoing") return;

    // Only show moves for player's own pieces
    if (
      (playerColor === "white" && piece && !piece.startsWith("w")) ||
      (playerColor === "black" && piece && !piece.startsWith("b"))
    ) {
      return;
    }

    // Get possible moves for this square
    const moves = game.moves({
      square: square,
      verbose: true
    });

    // Exit if no moves available
    if (moves.length === 0) return;

    // Highlight the square they moused over
    greySquare(square);

    // Highlight possible target squares
    for (let i = 0; i < moves.length; i++) {
      greySquare(moves[i].to);
    }
  }

  // Handle mouseout square - remove highlights
  function onMouseoutSquare() {
    removeGreySquares();
  }

  // Handle snap end - update board position
  function onSnapEnd() {
    board.position(game.fen());
  }

  // Update game status display
  function updateGameStatus() {
    let statusText = "";

    if (gameStatus === "ongoing") {
      statusText = game.turn() === "w" ? "White to move" : "Black to move";

      if (game.in_check()) {
        statusText += " (Check!)";
      }
    } else if (gameStatus === "checkmate") {
      statusText = `Checkmate! ${game.turn() === "w" ? "Black" : "White"} wins`;
    } else if (gameStatus === "stalemate") {
      statusText = "Stalemate! Game drawn";
    } else if (gameStatus === "draw") {
      statusText = "Game drawn";
    } else if (gameStatus === "resigned") {
      statusText = "Game ended by resignation";
    }

    document.getElementById("game-status").textContent = statusText;
  }

  // Update controls visibility
  function updateControls(state) {
    const controls = document.getElementById("game-controls");

    if (currentRole === "player" && state.status === "ongoing") {
      controls.classList.remove("hidden");

      // Only show offer draw if it's not already offered
      document.getElementById("offer-draw-btn").style.display =
        state.draw_offered_by ? "none" : "inline-block";
    } else {
      controls.classList.add("hidden");
    }
  }

  // Update move history display
  function updateMoveHistory(move) {
    const moveEl = document.createElement("div");
    const moveNumber = Math.ceil(game.history().length / 2);

    if (game.history().length % 2 === 1) {
      moveEl.textContent = `${moveNumber}. ${move}`;
    } else {
      moveEl.textContent = move;
    }

    document
      .getElementById("move-history")
      .insertBefore(moveEl, document.getElementById("move-history").firstChild);
    document.getElementById("move-history").scrollTop =
      document.getElementById("move-history").scrollHeight;
  }

  // Resign button handler
  document.getElementById("resign-btn").addEventListener("click", () => {
    if (confirm("Are you sure you want to resign?")) {
      socket.emit("resign", { room_id: roomId });
    }
  });

  // Offer draw button handler
  document.getElementById("offer-draw-btn").addEventListener("click", () => {
    if (confirm("Offer draw to your opponent?")) {
      socket.emit("offer_draw", { room_id: roomId });
      document.getElementById("offer-draw-btn").style.display = "none";
    }
  });

  // Accept draw button handler
  document.getElementById("accept-draw-btn").addEventListener("click", () => {
    socket.emit("accept_draw", { room_id: roomId });
    document.getElementById("draw-offer").classList.add("hidden");
  });

  // Handle beforeunload to notify server
  window.addEventListener("beforeunload", () => {
    socket.emit("leave_room", { room_id: roomId });
  });
  function displayCapturedPieces(captured, containerId, color) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    const pieceMap = {
      1: "p", // Pawn
      2: "n", // Knight
      3: "b", // Bishop
      4: "r", // Rook
      5: "q" // Queen
    };
    captured.forEach((pieceType) => {
      const pieceEl = document.createElement("div");
      pieceEl.className = "captured-piece";
      pieceEl.style.backgroundImage = `url(/assets/chessboardjs-1.0.0/img/chesspieces/wikipedia/${color}${pieceMap[pieceType]}.png)`;
      container.appendChild(pieceEl);
    });
  }

  function updateGameState(state) {
    game.load(state.fen);

    if (currentRole === "player") {
      if (socket.id === state.white_player) {
        playerColor = "white";
        board.orientation("white");
      } else if (socket.id === state.black_player) {
        playerColor = "black";
        board.orientation("black");
      }
    } else {
      board.orientation("white");
    }

    board.position(state.fen);

    document.getElementById("white-player").textContent = state.white_player
      ? state.white_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("black-player").textContent = state.black_player
      ? state.black_player.substring(0, 8)
      : "Waiting...";
    document.getElementById("watchers-count").textContent = state.watchers
      ? state.watchers.length
      : 0;

    // Update scores and captured pieces
    document.getElementById("white-score").textContent = state.white_score || 0;
    document.getElementById("black-score").textContent = state.black_score || 0;
    displayCapturedPieces(state.white_captured || [], "white-captured", "w");
    displayCapturedPieces(state.black_captured || [], "black-captured", "b");

    gameStatus = state.status;
    updateGameStatus();

    document.getElementById("move-history").innerHTML = "";
    state.move_history.forEach((move, i) => {
      const moveEl = document.createElement("div");
      moveEl.textContent = `${i + 1}. ${move}`;
      document
        .getElementById("move-history")
        .insertBefore(
          moveEl,
          document.getElementById("move-history").firstChild
        );
    });

    updateControls(state);
  }
});

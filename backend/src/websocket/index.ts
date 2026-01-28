/**
 * WebSocket Handlers Index
 * 
 * Exports all WebSocket connection handlers for different client types
 */

export {
  handleParticipantConnection,
  handleParticipantDisconnection,
} from './participant.handler';

export {
  handleControllerConnection,
  handleControllerDisconnection,
} from './controller.handler';

export {
  handleBigScreenConnection,
  handleBigScreenDisconnection,
} from './bigscreen.handler';

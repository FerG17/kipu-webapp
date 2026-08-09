import { StockMovement } from '../domain/model/stock-movement.entity.js';

/**
 * Maps raw API resources into StockMovement domain entities.
 * @class StockMovementAssembler
 */
export class StockMovementAssembler {
    /**
     * @param {Object} resource
     * @returns {StockMovement}
     */
    static toEntityFromResource(resource) {
        return new StockMovement({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse} response
     * @returns {StockMovement[]}
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`StockMovementAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['stockMovements'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}
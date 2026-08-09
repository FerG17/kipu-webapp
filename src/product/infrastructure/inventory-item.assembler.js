import { InventoryItem } from '../domain/model/inventory-item.entity.js';

/**
 * Maps raw API resources into InventoryItem domain entities.
 * Maps the json-server field `stockUnit` to the domain field `currentStock`
 * via the InventoryItem constructor.
 *
 * @class InventoryItemAssembler
 */
export class InventoryItemAssembler {
    /**
     * @param {Object} resource
     * @returns {InventoryItem}
     */
    static toEntityFromResource(resource) {
        return new InventoryItem({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse} response
     * @returns {InventoryItem[]}
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`InventoryItemAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['inventories'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}
import { Business } from '../domain/model/business.entity.js';

/**
 * Maps raw /businesses API resources into Business domain entities.
 * @class BusinessAssembler
 */
export class BusinessAssembler {
    /**
     * @param {Object} resource - Raw business resource from the API response.
     * @returns {Business}
     */
    static toEntityFromResource(resource) {
        return new Business({ ...resource });
    }

    /**
     * @param {import('axios').AxiosResponse} response
     * @returns {Business[]}
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`BusinessAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array ? response.data : response.data['businesses'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }

    /**
     * Converts a Business entity back into a raw API resource payload.
     * @param {Business} business
     * @returns {Object}
     */
    static toResourceFromEntity(business) {
        return {
            id:      business.id,
            name:    business.name,
            type:    business.type,
            address: business.address,
            ruc:     business.ruc,
            userId:  business.userId
        };
    }
}

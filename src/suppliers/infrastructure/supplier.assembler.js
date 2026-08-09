import { Supplier } from '../domain/model/supplier.entity.js';

/**
 * Assembler responsible for converting raw API resource objects
 * into Supplier domain entities and vice-versa.
 *
 * Follows the Assembler pattern used across all bounded contexts in Qullqa.
 *
 * @class SupplierAssembler
 */
export class SupplierAssembler {

    /**
     * Converts a single raw API resource object into a Supplier entity.
     *
     * @param {Object}      resource
     * @param {number}      resource.id
     * @param {number}      resource.businessId
     * @param {string}      resource.name
     * @param {string}      [resource.lastName]
     * @param {string}      resource.ruc
     * @param {string}      [resource.email]
     * @param {string}      resource.phone
     * @param {string}      [resource.address]
     * @param {string}      [resource.contactPerson]
     * @param {string}      [resource.category]
     * @param {string}      [resource.status]
     * @param {string}      [resource.since]
     * @returns {Supplier}
     */
    static toEntityFromResource(resource) {
        return new Supplier({
            id:            resource.id            ?? null,
            businessId:    resource.businessId    ?? null,
            name:          resource.name          ?? '',
            lastName:      resource.lastName      ?? '',
            ruc:           resource.ruc           ?? '',
            email:         resource.email         ?? '',
            phone:         resource.phone         ?? '',
            address:       resource.address       ?? '',
            contactPerson: resource.contactPerson ?? '',
            category:      resource.category      ?? 'GENERAL',
            status:        resource.status        ?? 'ACTIVE',
            since:         resource.since         ?? ''
        });
    }

    /**
     * Converts an array of raw API resource objects into an array of Supplier entities.
     *
     * @param {import('axios').AxiosResponse} response - Axios response whose data is an array.
     * @returns {Supplier[]}
     */
    static toEntitiesFromResponse(response) {
        const dataArray = Array.isArray(response.data) ? response.data : [];
        return dataArray.map(resource => SupplierAssembler.toEntityFromResource(resource));
    }

    /**
     * Converts a Supplier entity into a plain resource object for API persistence.
     *
     * @param {Supplier} entity
     * @returns {Object}
     */
    static toResourceFromEntity(entity) {
        return {
            id:            entity.id,
            businessId:    entity.businessId,
            name:          entity.name,
            lastName:      entity.lastName,
            ruc:           entity.ruc,
            email:         entity.email,
            phone:         entity.phone,
            address:       entity.address,
            contactPerson: entity.contactPerson,
            category:      entity.category,
            status:        entity.status,
            since:         entity.since
        };
    }
}
